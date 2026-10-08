"use server"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  frontOfTaskTitle,
  frontTaskTitle,
  isContentImagePath,
  MAX_PINNED,
  postImagePaths,
  removedImages,
} from "@/features/content/logic"
import { asSlides, POST_COLUMNS } from "@/features/content/queries"
import { CONTENT_BUCKET, removeContentImages } from "@/features/content/storage"
import {
  DISCARD_MAX,
  IMAGE_MAX,
  IMAGE_TYPES,
  parseFeedProfile,
  parseFrontTasks,
  parsePostInput,
  parsePostPatch,
  type FeedProfileInput,
  type FrontTaskInput,
  type PostInput,
  type PostPatch,
} from "@/features/content/validation"
import { formatShortDate } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, ContentPost, ContentSlide } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions da Central de Conteúdo. O banco cuida do resto: frente de
 * vídeo pelo formato, published_at, autoria, histórico e RLS. As imagens
 * (bucket `content`) saem do Storage quando o post é excluído ou quando a
 * imagem é trocada ou tirada.
 */

const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const
const CLIENT_NOT_FOUND = { ok: false, error: "Esse cliente não existe mais." } as const
const PINNED_FULL = {
  ok: false,
  error: `Já há ${MAX_PINNED} posts fixados no feed deste cliente. Desafixe um antes.`,
} as const

function refreshApp() {
  revalidatePath("/", "layout")
}

/** Slides para a coluna jsonb. */
function slidesJson(slides: ContentSlide[]): Json {
  return slides.map(({ text, image_path }) => ({ text, image_path }))
}

function saveFailure(error: PostgrestError, message: string): { ok: false; error: string } {
  if (error.code === "23503") return { ok: false, error: "O cliente, o projeto ou o responsável não existe mais." }
  return dbFailure(error, message)
}

/** Posts fixados do cliente, fora o próprio post (para conferir o limite de 3). */
async function pinnedElsewhere(
  supabase: SupabaseServerClient,
  clientId: string,
  postId?: string
): Promise<ActionResult<number>> {
  let query = supabase
    .from("content_posts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("pinned", true)
  if (postId) query = query.neq("id", postId)
  const { count, error } = await query
  if (error) return dbFailure(error, "Não foi possível fixar o post.")
  return { ok: true, data: count ?? 0 }
}

/** O post inteiro, com os textos (o diálogo abre com o resumo e lê o resto aqui). */
export async function loadPost(id: string): Promise<ActionResult<ContentPost>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_posts").select(POST_COLUMNS).eq("id", id).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir o post.")
  if (!data) return NOT_FOUND
  return { ok: true, data: { ...data, slides: asSlides(data.slides) } }
}

export async function createPost(input: PostInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parsePostInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  if (parsed.value.pinned) {
    const pinned = await pinnedElsewhere(supabase, parsed.value.client_id)
    if (!pinned.ok) return pinned
    if (pinned.data >= MAX_PINNED) return PINNED_FULL
  }
  const { data, error } = await supabase
    .from("content_posts")
    .insert({ ...parsed.value, slides: slidesJson(parsed.value.slides) })
    .select("id")
    .single()
  if (error) return saveFailure(error, "Não foi possível criar o post.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

/**
 * Edita o post (inclusive mudar de etapa pelo quadro ou fixar no feed). Só os
 * campos enviados mudam. Trocar ou tirar a capa ou a imagem de um slide apaga
 * o arquivo antigo.
 */
export async function updatePost(id: string, patch: PostPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parsePostPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }
  const { slides, ...fields } = parsed.value
  const supabase = await createClient()

  // O post como está, quando a mudança mexe nas imagens ou no que está fixado.
  const touchesImages = "cover_path" in fields || slides !== undefined
  let imagesBefore: string[] = []
  if (touchesImages || fields.pinned !== undefined || fields.client_id !== undefined) {
    const { data: current, error: readError } = await supabase
      .from("content_posts")
      .select("client_id, pinned, cover_path, slides")
      .eq("id", id)
      .maybeSingle()
    if (readError) return dbFailure(readError, "Não foi possível salvar o post.")
    if (!current) return NOT_FOUND
    imagesBefore = postImagePaths({ cover_path: current.cover_path, slides: asSlides(current.slides) })
    // Fixar (ou levar um post fixado para outro cliente) respeita o limite por cliente.
    const clientId = fields.client_id ?? current.client_id
    if ((fields.pinned ?? current.pinned) && (!current.pinned || clientId !== current.client_id)) {
      const pinned = await pinnedElsewhere(supabase, clientId, id)
      if (!pinned.ok) return pinned
      if (pinned.data >= MAX_PINNED) return PINNED_FULL
    }
  }

  const { data, error } = await supabase
    .from("content_posts")
    .update(slides ? { ...fields, slides: slidesJson(slides) } : fields)
    .eq("id", id)
    .select("cover_path, slides")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Confira a data e o horário: sem dia, não há horário." }
    return saveFailure(error, "Não foi possível salvar o post.")
  }
  const saved = data[0]
  if (!saved) return NOT_FOUND
  if (touchesImages) {
    const imagesAfter = postImagePaths({ cover_path: saved.cover_path, slides: asSlides(saved.slides) })
    await removeContentImages(supabase, removedImages(imagesBefore, imagesAfter))
  }

  refreshApp()
  return { ok: true, data: null }
}

/** Exclui o post e as imagens dele. As tarefas geradas continuam, sem o vínculo (o banco limpa). */
export async function deletePost(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_posts").delete().eq("id", id).select("cover_path, slides")
  if (error) return dbFailure(error, "Não foi possível excluir o post.")
  if (data.length === 0) return NOT_FOUND
  await removeContentImages(
    supabase,
    data.flatMap((post) => postImagePaths({ cover_path: post.cover_path, slides: asSlides(post.slides) }))
  )
  refreshApp()
  return { ok: true, data: null }
}

/**
 * Gera uma tarefa por frente escolhida (copy, design, vídeo), ligada ao post
 * (`content_post_id`), ao cliente e ao projeto dele, com responsáveis e prazo.
 */
export async function createFrontTasks(postId: string, items: FrontTaskInput[]): Promise<ActionResult<{ count: number }>> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  const parsed = parseFrontTasks(items)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data: post, error: readError } = await supabase
    .from("content_posts")
    .select("title, client_id, project_id, format, publish_on")
    .eq("id", postId)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível criar as tarefas.")
  if (!post) return NOT_FOUND

  const description = `${CONTENT_FORMAT_LABEL[post.format]}${post.publish_on ? ` para ${formatShortDate(post.publish_on)}` : ""}: ${post.title}`
  const { data: tasks, error } = await supabase
    .from("tasks")
    .insert(
      parsed.value.map((item) => ({
        title: frontTaskTitle(item.front, post.title),
        description,
        due_date: item.due_date,
        client_id: post.client_id,
        project_id: post.project_id,
        area: "clients" as const,
        content_post_id: postId,
      }))
    )
    .select("id, title")
  if (error) return dbFailure(error, "Não foi possível criar as tarefas.")

  // Cada tarefa recebe os responsáveis da sua frente (o título começa por ela).
  const assigneesByFront = new Map(parsed.value.map((item) => [item.front, item.assignee_ids]))
  const { error: assignError } = await supabase.from("task_assignees").insert(
    tasks.flatMap((task) => {
      const front = frontOfTaskTitle(task.title)
      return (front ? (assigneesByFront.get(front) ?? []) : []).map((profileId) => ({ task_id: task.id, profile_id: profileId }))
    })
  )
  if (assignError) {
    // Tarefas sem responsável sumiriam das listas "Minhas": desfaz.
    await supabase.from("tasks").delete().in("id", tasks.map((task) => task.id))
    return dbFailure(assignError, "Não foi possível criar as tarefas.")
  }

  refreshApp()
  return { ok: true, data: { count: tasks.length } }
}

/* ------------------------------------------------------------------ */
/* Imagens e perfil do feed                                            */
/* ------------------------------------------------------------------ */

/**
 * URL assinada para o navegador enviar uma imagem (capa, slide ou foto do
 * perfil) direto ao Storage, sem passar pelo limite de tamanho das Server
 * Actions, e o caminho que vai no banco (`<client_id>/<arquivo>`). A imagem
 * só abre pelo app (/api/conteudo/…), para a equipe.
 */
export async function createContentImageUpload(
  clientId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (!(IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > IMAGE_MAX) {
    return { ok: false, error: "A imagem precisa ter até 5 MB." }
  }

  const path = `${clientId}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar a imagem." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/**
 * Apaga imagens enviadas que não chegaram a ser salvas (o post foi fechado
 * sem salvar, ou a imagem foi trocada antes de salvar). Por segurança, as que
 * algum post ou cliente usa ficam.
 */
export async function discardContentImages(paths: string[]): Promise<ActionResult> {
  await requireUser()
  if (!Array.isArray(paths) || paths.length > DISCARD_MAX || !paths.every(isContentImagePath)) {
    return { ok: false, error: "Imagens inválidas." }
  }
  const unique = [...new Set(paths)]
  if (unique.length === 0) return { ok: true, data: null }

  const supabase = await createClient()
  const [[covers, avatars], slideUses] = await Promise.all([
    Promise.all([
      supabase.from("content_posts").select("cover_path").in("cover_path", unique),
      supabase.from("clients").select("avatar_path").in("avatar_path", unique),
    ]),
    Promise.all(
      unique.map((path) =>
        supabase.from("content_posts").select("id").contains("slides", JSON.stringify([{ image_path: path }])).limit(1)
      )
    ),
  ])
  if (covers.error || avatars.error || slideUses.some((use) => use.error)) {
    return { ok: false, error: "Não foi possível conferir as imagens." }
  }
  const inUse = new Set<string>([
    ...covers.data.flatMap((post) => (post.cover_path ? [post.cover_path] : [])),
    ...avatars.data.flatMap((client) => (client.avatar_path ? [client.avatar_path] : [])),
    ...unique.filter((_, index) => (slideUses[index]?.data?.length ?? 0) > 0),
  ])
  await removeContentImages(supabase, unique.filter((path) => !inUse.has(path)))
  return { ok: true, data: null }
}

/** Foto do perfil do cliente (cabeçalho do feed e a marca do cliente nas telas). A anterior sai do Storage. */
export async function setClientAvatar(clientId: string, path: string | null): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (path !== null && !(isContentImagePath(path) && path.startsWith(`${clientId}/`))) {
    return { ok: false, error: "Imagem inválida." }
  }

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from("clients")
    .select("avatar_path")
    .eq("id", clientId)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível salvar a foto.")
  if (!current) return CLIENT_NOT_FOUND
  const { error } = await supabase.from("clients").update({ avatar_path: path }).eq("id", clientId)
  if (error) return dbFailure(error, "Não foi possível salvar a foto.")
  if (current.avatar_path && current.avatar_path !== path) await removeContentImages(supabase, [current.avatar_path])

  refreshApp()
  return { ok: true, data: null }
}

/** @ e bio do Instagram do cliente, editados no cabeçalho do feed. */
export async function updateFeedProfile(clientId: string, input: FeedProfileInput): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  const parsed = parseFeedProfile(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").update(parsed.value).eq("id", clientId).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Confira o @ (letras, números, ponto e sublinhado) e a bio (até 150)." }
    return dbFailure(error, "Não foi possível salvar o perfil.")
  }
  if (data.length === 0) return CLIENT_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}
