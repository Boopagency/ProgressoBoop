import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import type { PostSummary } from "@/features/content/logic"
import { addDaysToKey, todayKey } from "@/lib/dates"
import type { Json } from "@/lib/supabase/database.types"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ContentPost, ContentSlide, PublishStatus } from "@/lib/types"

/** Colunas das listas (sem os textos longos, lidos ao abrir o post). */
export const POST_SUMMARY_COLUMNS =
  "id, client_id, project_id, title, format, networks, intents, publish_on, publish_time, stage, copy_status, design_status, video_status, owner_id, drive_url, cover_path, pinned, published_at, auto_publish, publish_status, publish_error, publish_attempts, instagram_permalink, created_by, created_at, updated_at"

export const POST_COLUMNS = `${POST_SUMMARY_COLUMNS}, brief, design_notes, script, slides, caption`

/**
 * Publicados mais antigos que isso ficam fora das telas (o calendário mostra
 * seis meses para trás). Tudo o que ainda não foi publicado e os posts sem
 * data entram sempre. Assim a consulta fica longe do limite de 1.000 linhas.
 */
export const PUBLISHED_LOOKBACK_DAYS = 180

/** Slides gravados no banco (jsonb) → lista tipada; o que não tiver o formato fica de fora. */
export function asSlides(value: Json): ContentSlide[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item) || typeof item.text !== "string") return []
    return [{ text: item.text, image_path: typeof item.image_path === "string" ? item.image_path : null }]
  })
}

const PUBLISH_STATUSES: readonly string[] = ["queued", "publishing", "published", "failed"] satisfies PublishStatus[]

/** `publish_status` vem do banco como texto (coluna com check): no tipo do app. */
export function withPublishStatus<T extends { publish_status: string | null }>(
  row: T
): Omit<T, "publish_status"> & { publish_status: PublishStatus | null } {
  const status = row.publish_status
  return { ...row, publish_status: status && PUBLISH_STATUSES.includes(status) ? (status as PublishStatus) : null }
}

/** O post inteiro, com os textos (sessão do app ou token do conector, sob o RLS). `null` se não existe. */
export async function fetchPost(supabase: SupabaseServerClient, id: string): Promise<ContentPost | null> {
  const { data, error } = await supabase.from("content_posts").select(POST_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw loadError(error, "o post")
  return data ? withPublishStatus({ ...data, slides: asSlides(data.slides) }) : null
}

/** Posts de todos os clientes (ou de um), sem os textos longos. */
export const getContentPosts = cache(async (clientId?: string): Promise<PostSummary[]> => {
  await requireUser()
  const supabase = await createClient()
  const since = addDaysToKey(todayKey(), -PUBLISHED_LOOKBACK_DAYS)
  let query = supabase
    .from("content_posts")
    .select(POST_SUMMARY_COLUMNS)
    .or(`stage.neq.published,publish_on.is.null,publish_on.gte.${since}`)
  if (clientId) query = query.eq("client_id", clientId)
  const { data, error } = await query.order("publish_on", { ascending: false, nullsFirst: true }).limit(1000)
  if (error) throw loadError(error, "os posts")
  return data.map(withPublishStatus)
})

export type PostSearchRow = Pick<
  ContentPost,
  "id" | "client_id" | "title" | "caption" | "format" | "stage" | "publish_on" | "publish_time"
>

/**
 * Posts para a busca geral: título e legenda (inclusive os publicados há
 * muito tempo), os editados por último primeiro. A busca sem acento é feita
 * no servidor do app, como nos outros grupos.
 */
export async function getPostsForSearch(): Promise<PostSearchRow[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_posts")
    .select("id, client_id, title, caption, format, stage, publish_on, publish_time")
    .order("updated_at", { ascending: false })
    .limit(1000)
  if (error) throw loadError(error, "a busca")
  return data
}
