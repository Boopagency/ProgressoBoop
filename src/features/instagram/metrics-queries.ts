import "server-only"

import { evolution, summarize, type Checkpoint, type MediaKind, type MetricReading, type MetricsSummary } from "@/features/instagram/metrics-logic"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { Timestamp } from "@/lib/types"

/*
 * Leitura das métricas dos posts, sempre com a sessão da pessoa: o RLS dá
 * tudo à equipe e só os posts publicados dela ao cliente. O JSON bruto da
 * Meta não sai do banco (a coluna nem tem permissão de leitura pela API).
 */

/** Colunas que as telas usam (a view da última leitura tem as mesmas, sem o erro). */
export const READING_COLUMNS =
  "post_id, checkpoint, collected_at, media_kind, views, reach, likes, comments, saved, shares, total_interactions, follows, profile_visits, replies, navigation, avg_watch_time_ms, total_watch_time_ms"

type ReadingRow = {
  post_id: string | null
  checkpoint: string | null
  collected_at: string | null
  media_kind: string | null
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  saved: number | null
  shares: number | null
  total_interactions: number | null
  follows: number | null
  profile_visits: number | null
  replies: number | null
  navigation: number | null
  avg_watch_time_ms: number | null
  total_watch_time_ms: number | null
}

/** Linha do banco → leitura tipada (a view devolve tudo como opcional). */
export function toReading(row: ReadingRow): MetricReading | null {
  if (!row.post_id || !row.checkpoint || !row.collected_at) return null
  return {
    post_id: row.post_id,
    checkpoint: row.checkpoint as Checkpoint,
    collected_at: row.collected_at,
    media_kind: (row.media_kind ?? "feed") as MediaKind,
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    saved: row.saved,
    shares: row.shares,
    total_interactions: row.total_interactions,
    follows: row.follows,
    profile_visits: row.profile_visits,
    replies: row.replies,
    navigation: row.navigation,
    avg_watch_time_ms: row.avg_watch_time_ms,
    total_watch_time_ms: row.total_watch_time_ms,
  }
}

function readings(rows: ReadingRow[]): MetricReading[] {
  return rows.flatMap((row) => {
    const reading = toReading(row)
    return reading ? [reading] : []
  })
}

/** As leituras de um post: as que deram certo (na ordem dos momentos), os momentos já feitos e o último erro. */
export async function fetchPostReadings(
  supabase: SupabaseServerClient,
  postId: string,
  withError: boolean
): Promise<{ readings: MetricReading[]; done: string[]; lastError: string | null }> {
  const { data, error } = await supabase
    .from("content_post_metrics")
    .select(withError ? `${READING_COLUMNS}, error` : READING_COLUMNS)
    .eq("post_id", postId)
    .order("collected_at", { ascending: true })
  if (error) throw loadError(error, "as métricas")
  const rows = data as unknown as (ReadingRow & { error?: string | null })[]
  const last = rows.at(-1)
  return {
    readings: evolution(readings(rows.filter((row) => !row.error))),
    done: rows.flatMap((row) => (row.checkpoint ? [row.checkpoint] : [])),
    lastError: withError && last?.error ? last.error : null,
  }
}

/** A última leitura de cada post da lista (até 300 por vez). */
export async function fetchLatestReadings(supabase: SupabaseServerClient, postIds: readonly string[]): Promise<MetricReading[]> {
  if (postIds.length === 0) return []
  const result: MetricReading[] = []
  for (let start = 0; start < postIds.length; start += 300) {
    const { data, error } = await supabase
      .from("content_post_latest_metrics")
      .select(READING_COLUMNS)
      .in("post_id", postIds.slice(start, start + 300))
    if (error) throw loadError(error, "as métricas")
    result.push(...readings(data))
  }
  return result
}

/** Visualizações da última leitura, por post (para o feed). */
export function viewsByPost(latest: readonly MetricReading[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const reading of latest) if (reading.views !== null) map[reading.post_id] = reading.views
  return map
}

/** Portal: as leituras de um post publicado do cliente (o RLS confere). */
export async function getPortalPostReadings(postId: string): Promise<MetricReading[]> {
  await requirePortalUser()
  const supabase = await createClient()
  return (await fetchPostReadings(supabase, postId, false)).readings
}

/** Portal: visualizações dos posts publicados do feed. */
export async function getPortalFeedViews(postIds: readonly string[]): Promise<Record<string, number>> {
  await requirePortalUser()
  const supabase = await createClient()
  return viewsByPost(await fetchLatestReadings(supabase, postIds))
}

/** Resumo de um período, por cliente (relatórios e o cartão do cliente). */
export interface ClientMetricsSummary extends MetricsSummary {
  clientId: string
  bestTitle: string | null
}

/**
 * Posts publicados no Instagram entre `from` e `to` (instantes), de um
 * cliente ou de todos, e o resumo das últimas leituras de cada cliente.
 */
export async function fetchMetricsSummaries(
  supabase: SupabaseServerClient,
  range: { from: Timestamp; to: Timestamp },
  clientId?: string
): Promise<ClientMetricsSummary[]> {
  let query = supabase
    .from("content_posts")
    .select("id, client_id, title")
    .eq("stage", "published")
    .contains("networks", ["instagram"])
    .gte("published_at", range.from)
    .lt("published_at", range.to)
  if (clientId) query = query.eq("client_id", clientId)
  const { data: posts, error } = await query.order("published_at").limit(1000)
  if (error) throw loadError(error, "os posts publicados")

  const latest = await fetchLatestReadings(
    supabase,
    posts.map((post) => post.id)
  )
  const titles = new Map(posts.map((post) => [post.id, post.title]))
  const byClient = new Map<string, string[]>()
  for (const post of posts) byClient.set(post.client_id, [...(byClient.get(post.client_id) ?? []), post.id])
  return [...byClient.entries()].map(([id, postIds]) => {
    const summary = summarize(postIds, latest)
    return { ...summary, clientId: id, bestTitle: summary.best ? (titles.get(summary.best.postId) ?? null) : null }
  })
}
