import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import type { PostSummary } from "@/features/content/logic"
import { addDaysToKey, todayKey } from "@/lib/dates"
import type { Json } from "@/lib/supabase/database.types"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ContentSlide } from "@/lib/types"

/** Colunas das listas (sem os textos longos, lidos ao abrir o post). */
export const POST_SUMMARY_COLUMNS =
  "id, client_id, project_id, title, format, networks, intents, publish_on, publish_time, stage, copy_status, design_status, video_status, owner_id, drive_url, cover_path, pinned, published_at, created_by, created_at, updated_at"

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
  return data
})
