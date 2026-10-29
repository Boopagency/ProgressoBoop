"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { instagramJobsSecret } from "@/features/instagram/config"
import { accountMedia } from "@/features/instagram/meta"
import {
  ACCOUNT_MEDIA_FIELDS,
  ACCOUNT_MEDIA_FIELDS_NO_CAPTION,
  ACCOUNT_MEDIA_LIMIT,
  mediaKind,
  nextCollectionAt,
  type AccountMedia,
  type MediaKind,
  type MetricReading,
} from "@/features/instagram/metrics-logic"
import {
  fetchLatestReadings,
  fetchMetricsSummaries,
  fetchPostReadings,
  viewsByPost,
  type ClientMetricsSummary,
} from "@/features/instagram/metrics-queries"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Métricas no admin (só a equipe): o bloco "Desempenho" do post, as
 * visualizações no feed, o resumo do cliente e "Ligar ao post do Instagram".
 * O token do cliente é lido no servidor com o segredo dos jobs
 * (instagram_account_token) e nunca vai para o navegador.
 */

const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const

/** O que o bloco "Desempenho" precisa. */
export interface PostPerformance {
  /** O post tem a publicação do Instagram ligada. */
  linked: boolean
  permalink: string | null
  publishedAt: string | null
  kind: MediaKind
  readings: MetricReading[]
  /** Quando será a próxima leitura (ISO), ou null se a coleta acabou ou não começa. */
  nextAt: string | null
  lastError: string | null
  /** Dá para listar as publicações da conta (integração configurada e conta conectada). */
  canLink: boolean
}

/** Token da conta do cliente, só no servidor. */
async function clientToken(supabase: SupabaseServerClient, clientId: string) {
  const secret = instagramJobsSecret()
  if (!secret) return null
  const { data, error } = await supabase.rpc("instagram_account_token", { p_secret: secret, p_client_id: clientId })
  if (error) {
    console.error(`[instagram] token ${clientId}: ${error.message}`)
    return null
  }
  const account = data?.[0]
  return account ? { userId: account.external_user_id, token: account.access_token } : null
}

async function hasConnectedAccount(supabase: SupabaseServerClient, clientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("social_accounts")
    .select("status, token_expires_at")
    .eq("client_id", clientId)
    .eq("network", "instagram")
    .maybeSingle()
  return Boolean(data && data.status !== "expired" && Date.parse(data.token_expires_at) > Date.now())
}

export async function loadPostPerformance(postId: string): Promise<ActionResult<PostPerformance>> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  const supabase = await createClient()
  const { data: post, error } = await supabase
    .from("content_posts")
    .select("client_id, format, instagram_media_id, instagram_permalink, published_at")
    .eq("id", postId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o post.")
  if (!post) return NOT_FOUND

  const linked = post.instagram_media_id !== null
  const [series, connected] = await Promise.all([
    linked ? fetchPostReadings(supabase, postId, true).catch(() => null) : null,
    linked ? Promise.resolve(false) : hasConnectedAccount(supabase, post.client_id),
  ])
  if (linked && !series) return { ok: false, error: "Não foi possível ler as métricas." }
  const readings = series?.readings ?? []
  const kind = readings.at(-1)?.media_kind ?? mediaKind(post.format)
  const next = linked && post.published_at ? nextCollectionAt(kind, Date.parse(post.published_at), series?.done ?? [], Date.now()) : null
  return {
    ok: true,
    data: {
      linked,
      permalink: post.instagram_permalink,
      publishedAt: post.published_at,
      kind,
      readings,
      nextAt: next === null ? null : new Date(next).toISOString(),
      lastError: series?.lastError ?? null,
      canLink: !linked && connected && instagramJobsSecret() !== null,
    },
  }
}

/** Visualizações da última leitura dos posts publicados do cliente (feed do Conteúdo). */
export async function loadFeedViews(clientId: string): Promise<ActionResult<Record<string, number>>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, error: "Cliente inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_posts")
    .select("id")
    .eq("client_id", clientId)
    .eq("stage", "published")
    .not("instagram_media_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(300)
  if (error) return dbFailure(error, "Não foi possível ler as métricas.")
  try {
    return { ok: true, data: viewsByPost(await fetchLatestReadings(supabase, data.map((row) => row.id))) }
  } catch {
    return { ok: false, error: "Não foi possível ler as métricas." }
  }
}

/** Resumo dos últimos 30 dias do cliente (cartão Conteúdo). */
export async function loadClientMetricsSummary(clientId: string): Promise<ActionResult<ClientMetricsSummary | null>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, error: "Cliente inválido." }
  const supabase = await createClient()
  const now = Date.now()
  try {
    const [summary] = await fetchMetricsSummaries(
      supabase,
      { from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() },
      clientId
    )
    return { ok: true, data: summary ?? null }
  } catch {
    return { ok: false, error: "Não foi possível ler as métricas." }
  }
}

/** Publicação da conta, com a indicação de já estar ligada a outro post. */
export interface LinkableMedia extends AccountMedia {
  taken: boolean
}

/** As publicações recentes da conta do cliente, na Meta (GET /{ig-user-id}/media). */
async function recentMedia(supabase: SupabaseServerClient, clientId: string): Promise<ActionResult<AccountMedia[]>> {
  const account = await clientToken(supabase, clientId)
  if (!account) return { ok: false, error: "O Instagram do cliente não está conectado (ou a conexão venceu)." }
  let result = await accountMedia(account.userId, account.token, ACCOUNT_MEDIA_FIELDS, ACCOUNT_MEDIA_LIMIT)
  // A documentação lista `caption` só para o login do Facebook: sem ela, pede de novo sem a legenda.
  if (!result.ok && !result.network && !result.invalidToken) {
    result = await accountMedia(account.userId, account.token, ACCOUNT_MEDIA_FIELDS_NO_CAPTION, ACCOUNT_MEDIA_LIMIT)
  }
  if (!result.ok) return { ok: false, error: `O Instagram não devolveu as publicações: ${result.error}` }
  return { ok: true, data: result.value }
}

export async function listLinkableMedia(postId: string): Promise<ActionResult<LinkableMedia[]>> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  const supabase = await createClient()
  const { data: post, error } = await supabase.from("content_posts").select("client_id").eq("id", postId).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o post.")
  if (!post) return NOT_FOUND
  const media = await recentMedia(supabase, post.client_id)
  if (!media.ok) return media
  const ids = media.data.map((item) => item.id)
  const { data: taken, error: takenError } =
    ids.length > 0
      ? await supabase.from("content_posts").select("instagram_media_id").in("instagram_media_id", ids)
      : { data: [], error: null }
  if (takenError) return dbFailure(takenError, "Não foi possível conferir as publicações.")
  const used = new Set(taken.map((row) => row.instagram_media_id))
  return { ok: true, data: media.data.map((item) => ({ ...item, taken: used.has(item.id) })) }
}

const LINK_ERRORS: Record<string, string> = {
  not_published: "Só post publicado e do Instagram pode ser ligado.",
  already_linked: "Esse post já está ligado a uma publicação do Instagram.",
  media_taken: "Essa publicação já está ligada a outro post.",
  invalid_media: "Publicação inválida.",
}

/**
 * Liga o post publicado a uma publicação da conta do cliente. Confere de novo
 * na Meta que a publicação está entre as recentes da conta (e pega o link e a
 * data de lá, não do navegador).
 */
export async function linkInstagramMedia(postId: string, mediaId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  if (!/^\d{1,64}$/.test(mediaId)) return { ok: false, error: LINK_ERRORS.invalid_media! }
  const supabase = await createClient()
  const { data: post, error } = await supabase.from("content_posts").select("client_id").eq("id", postId).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o post.")
  if (!post) return NOT_FOUND
  const media = await recentMedia(supabase, post.client_id)
  if (!media.ok) return media
  const chosen = media.data.find((item) => item.id === mediaId)
  if (!chosen) return { ok: false, error: "Essa publicação não está entre as recentes da conta do cliente." }

  const { error: linkError } = await supabase.rpc("link_instagram_media", {
    p_post_id: postId,
    p_media_id: chosen.id,
    // O gerador de tipos marca todo argumento como obrigatório; a função aceita null nos dois.
    p_permalink: chosen.permalink as string,
    p_published_at: chosen.timestamp as string,
  })
  if (linkError) {
    const known = LINK_ERRORS[linkError.message]
    return known ? { ok: false, error: known } : dbFailure(linkError, "Não foi possível ligar o post.")
  }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}
