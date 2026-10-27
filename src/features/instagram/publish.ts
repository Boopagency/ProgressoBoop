import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"
import sharp from "sharp"

import { asSlides } from "@/features/content/queries"
import { CONTENT_BUCKET, removeContentImages } from "@/features/content/storage"
import { instagramApp } from "@/features/instagram/config"
import {
  imageProblem,
  publishBlockers,
  publishKind,
  publishSourcePaths,
  urlsExpireAt,
  type PublishCandidate,
  type PublishKind,
} from "@/features/instagram/publish-logic"
import { zonedTimeToInstant } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, ContentPost, PublishStatus } from "@/lib/types"

/*
 * Ligar e desligar a publicação automática, sempre com a sessão de quem
 * agenda (o job roda sem sessão e o bucket `content` é privado): confere as
 * regras, converte as imagens para JPEG (o único formato que a Meta aceita),
 * grava as cópias no bucket, assina as URLs até 3 dias depois do horário e
 * entrega tudo a schedule_instagram_publish, que guarda as URLs fora da API.
 */

/** O que a tela mostra da publicação (e a etapa, que vai para "Agendado"). */
export type PublishState = Pick<
  ContentPost,
  "stage" | "auto_publish" | "publish_status" | "publish_error" | "publish_attempts" | "instagram_permalink"
>

const STATE_COLUMNS = "stage, auto_publish, publish_status, publish_error, publish_attempts, instagram_permalink"
const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const
/** Lado maior que a Meta aceita no feed (acima disso, ela reduz). */
const MAX_WIDTH = 1440
/** O bucket aceita até 5 MB: se a cópia passar, baixa a qualidade. */
const BUCKET_MAX_BYTES = 5 * 1024 * 1024
const JPEG_QUALITIES = [90, 80, 70] as const

/** Erros das funções do banco → frase para a pessoa. */
const SCHEDULE_ERRORS = {
  publishing: "O post está sendo publicado agora. Espere um pouco e abra de novo.",
  already_published: "Esse post já foi publicado no Instagram.",
  stage: "O post precisa estar Aprovado ou Agendado.",
  not_publishable: "Só posts do Instagram com imagem (estático, foto, carrossel ou story) publicam sozinhos.",
  no_time: "Escolha o dia e o horário da publicação.",
  media_changed: "As imagens do post mudaram enquanto agendava. Tente de novo.",
  invalid_media: "Não foi possível preparar as imagens. Tente de novo.",
  not_found: NOT_FOUND.error,
} satisfies Record<string, string>

function scheduleFailure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  const known = (SCHEDULE_ERRORS as Record<string, string | undefined>)[error.message]
  return known ? { ok: false, error: known } : dbFailure(error, fallback)
}

async function readState(supabase: SupabaseServerClient, postId: string): Promise<ActionResult<PublishState>> {
  const { data, error } = await supabase.from("content_posts").select(STATE_COLUMNS).eq("id", postId).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o post.")
  if (!data) return NOT_FOUND
  return { ok: true, data: { ...data, publish_status: data.publish_status as PublishStatus | null } }
}

/** A conta do Instagram do cliente está conectada e o token ainda vale. */
async function accountConnected(supabase: SupabaseServerClient, clientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("social_accounts")
    .select("status, token_expires_at")
    .eq("client_id", clientId)
    .eq("network", "instagram")
    .maybeSingle()
  return Boolean(data && data.status !== "expired" && Date.parse(data.token_expires_at) > Date.now())
}

type PostForPublish = PublishCandidate & {
  client_id: string
  auto_publish: boolean
  publish_status: string | null
}

async function readPost(supabase: SupabaseServerClient, postId: string): Promise<ActionResult<PostForPublish>> {
  const { data, error } = await supabase
    .from("content_posts")
    .select("client_id, format, networks, stage, publish_on, publish_time, caption, cover_path, slides, auto_publish, publish_status")
    .eq("id", postId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o post.")
  if (!data) return NOT_FOUND
  return { ok: true, data: { ...data, slides: asSlides(data.slides) } }
}

function dueAtOf(post: Pick<PublishCandidate, "publish_on" | "publish_time">): number | null {
  if (!post.publish_on || !post.publish_time) return null
  return Date.parse(zonedTimeToInstant(post.publish_on, post.publish_time.slice(0, 5)))
}

function imageLabel(kind: PublishKind, index: number): string {
  if (kind === "carousel") return `O slide ${index + 1}`
  return kind === "story" ? "A imagem do story" : "A capa"
}

/** Lê a imagem do bucket (com a sessão) e devolve uma cópia em JPEG sRGB, já conferida para o Instagram. */
async function jpegCopy(
  supabase: SupabaseServerClient,
  path: string,
  kind: PublishKind,
  label: string
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const { data: blob, error } = await supabase.storage.from(CONTENT_BUCKET).download(path)
  if (error || !blob) return { ok: false, error: `${label}: não foi possível ler a imagem. Envie de novo.` }
  try {
    const input = Buffer.from(await blob.arrayBuffer())
    for (const quality of JPEG_QUALITIES) {
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .toColourspace("srgb")
        .jpeg({ quality })
        .toBuffer({ resolveWithObject: true })
      const problem = imageProblem({ width: info.width, height: info.height, bytes: info.size }, kind, label)
      if (problem) return { ok: false, error: problem }
      if (info.size <= BUCKET_MAX_BYTES) return { ok: true, buffer: data }
    }
    return { ok: false, error: `${label} ficou grande demais em JPEG. Envie uma versão menor.` }
  } catch {
    return { ok: false, error: `${label}: não deu para converter a imagem para JPEG. Envie em PNG ou JPG.` }
  }
}

/**
 * Liga (ou refaz) a publicação automática: confere tudo, prepara as imagens e
 * põe na fila. O post vai para "Agendado".
 */
export async function scheduleInstagramPublish(supabase: SupabaseServerClient, postId: string): Promise<ActionResult<PublishState>> {
  if (!instagramApp()) return { ok: false, error: "Integração com o Instagram não configurada." }
  const read = await readPost(supabase, postId)
  if (!read.ok) return read
  const post = read.data
  if (post.publish_status === "publishing") return { ok: false, error: SCHEDULE_ERRORS.publishing }
  if (post.publish_status === "published") return { ok: false, error: SCHEDULE_ERRORS.already_published }

  const now = Date.now()
  const dueAt = dueAtOf(post)
  const blockers = publishBlockers(post, {
    accountConnected: await accountConnected(supabase, post.client_id),
    dueAt,
    now,
    requireFuture: true,
  })
  const kind = publishKind(post.format)
  if (blockers.length > 0 || !kind || dueAt === null) return { ok: false, error: blockers.join(" ") || SCHEDULE_ERRORS.no_time }
  const sources = publishSourcePaths(post).filter((path): path is string => path !== null)

  // Cópias em JPEG, na ordem; qualquer imagem com problema impede (e as já gravadas saem).
  const copies: string[] = []
  for (const [index, source] of sources.entries()) {
    const copy = await jpegCopy(supabase, source, kind, imageLabel(kind, index))
    if (!copy.ok) {
      await removeContentImages(supabase, copies)
      return copy
    }
    // Com extensão: a Meta baixa a imagem pela URL.
    const path = `${post.client_id}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage
      .from(CONTENT_BUCKET)
      .upload(path, copy.buffer, { contentType: "image/jpeg", upsert: false })
    if (error) {
      console.error(`[storage] ${error.message}`)
      await removeContentImages(supabase, copies)
      return { ok: false, error: "Não foi possível preparar as imagens. Tente de novo." }
    }
    copies.push(path)
  }

  const expiresAt = urlsExpireAt(dueAt, now)
  const { data: signed, error: signError } = await supabase.storage
    .from(CONTENT_BUCKET)
    .createSignedUrls(copies, Math.ceil((expiresAt - now) / 1000))
  const urls = (signed ?? []).flatMap((item) => (item.signedUrl?.startsWith("https://") ? [item.signedUrl] : []))
  if (signError || urls.length !== copies.length) {
    if (signError) console.error(`[storage] ${signError.message}`)
    await removeContentImages(supabase, copies)
    return { ok: false, error: "Não foi possível preparar as imagens. Tente de novo." }
  }

  const { data: replaced, error } = await supabase.rpc("schedule_instagram_publish", {
    p_post_id: postId,
    p_sources: sources,
    p_media_urls: urls,
    p_jpeg_paths: copies,
    p_urls_expire_at: new Date(expiresAt).toISOString(),
  })
  if (error) {
    await removeContentImages(supabase, copies)
    return scheduleFailure(error, "Não foi possível agendar a publicação.")
  }
  await removeContentImages(supabase, replaced ?? [])
  return readState(supabase, postId)
}

/** Desliga: tira da fila e apaga as cópias em JPEG. A etapa fica como está. */
export async function cancelInstagramPublish(supabase: SupabaseServerClient, postId: string): Promise<ActionResult<PublishState>> {
  const { data: copies, error } = await supabase.rpc("cancel_instagram_publish", { p_post_id: postId })
  if (error) return scheduleFailure(error, "Não foi possível desligar a publicação automática.")
  await removeContentImages(supabase, copies ?? [])
  return readState(supabase, postId)
}

/** Mudanças que pedem imagens e URLs novas (outra imagem, outro cliente, outro horário). */
const REBUILD_FIELDS = ["client_id", "format", "cover_path", "slides", "publish_on", "publish_time"]
/** Mudanças que só pedem conferir de novo as regras. */
const RECHECK_FIELDS = ["caption", "networks", "stage"]

/**
 * Depois de salvar um post que está na fila: refaz as imagens e as URLs
 * quando a imagem, o cliente ou o horário mudaram, ou só confere as regras.
 * Se não dá mais para publicar, desliga e devolve o motivo para a tela.
 */
export async function refreshAutoPublish(
  supabase: SupabaseServerClient,
  postId: string,
  changed: readonly string[]
): Promise<string | null> {
  const rebuild = changed.some((field) => REBUILD_FIELDS.includes(field))
  if (!rebuild && !changed.some((field) => RECHECK_FIELDS.includes(field))) return null
  const read = await readPost(supabase, postId)
  if (!read.ok || !read.data.auto_publish || read.data.publish_status !== "queued") return null

  let reason: string | null = null
  if (rebuild) {
    const scheduled = await scheduleInstagramPublish(supabase, postId)
    if (!scheduled.ok) reason = scheduled.error
  } else {
    const post = read.data
    const blockers = publishBlockers(post, {
      accountConnected: await accountConnected(supabase, post.client_id),
      dueAt: dueAtOf(post),
      now: Date.now(),
    })
    reason = blockers[0] ?? null
  }
  if (reason === null) return null
  await cancelInstagramPublish(supabase, postId)
  return `A publicação automática foi desligada: ${reason}`
}
