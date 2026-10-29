import type { ContentFormat } from "@/lib/types"

/*
 * Regras puras das métricas dos posts no Instagram (PR 3/3 da issue #89),
 * conforme a documentação da Meta (API do Instagram com login do Instagram):
 * campos em GET /{ig-media-id}, métricas em GET /{ig-media-id}/insights
 * (período sempre `lifetime`) e a lista em GET /{ig-user-id}/media.
 *
 * Sem React, sem banco e sem imports de valor (só tipos), para o teste rodar
 * direto no Node: `node --test src/features/instagram/metrics-logic.test.mjs`.
 */

/** Como a coleta trata a publicação: feed (imagem e carrossel), reels (vídeo) ou story. */
export type MediaKind = "feed" | "reels" | "story"

/** Momentos da leitura em relação à publicação (os valores da coluna `checkpoint`). */
export type Checkpoint = "1h" | "12h" | "23h" | "24h" | "3d" | "7d" | "30d"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/**
 * Quando ler, por tipo. Feed e reels: +1 h, +24 h, +3 dias, +7 dias e +30
 * dias, e para. Stories: +1 h, +12 h e +23 h, antes de sumirem da API (24 h).
 */
export const CHECKPOINTS: Record<MediaKind, readonly { checkpoint: Checkpoint; offsetMs: number }[]> = {
  feed: [
    { checkpoint: "1h", offsetMs: HOUR },
    { checkpoint: "24h", offsetMs: DAY },
    { checkpoint: "3d", offsetMs: 3 * DAY },
    { checkpoint: "7d", offsetMs: 7 * DAY },
    { checkpoint: "30d", offsetMs: 30 * DAY },
  ],
  reels: [
    { checkpoint: "1h", offsetMs: HOUR },
    { checkpoint: "24h", offsetMs: DAY },
    { checkpoint: "3d", offsetMs: 3 * DAY },
    { checkpoint: "7d", offsetMs: 7 * DAY },
    { checkpoint: "30d", offsetMs: 30 * DAY },
  ],
  story: [
    { checkpoint: "1h", offsetMs: HOUR },
    { checkpoint: "12h", offsetMs: 12 * HOUR },
    { checkpoint: "23h", offsetMs: 23 * HOUR },
  ],
}

/** Story: as métricas somem da API 24 h depois de publicar. */
export const STORY_LIFETIME_MS = DAY
/** Feed e reels: depois disso não lê mais (a de +30 dias atrasada ainda entra). O banco corta em 35 dias. */
export const FEED_WINDOW_MS = 35 * DAY
/** Posts lidos por rodada (de hora em hora): duas chamadas cada, longe do limite da Meta. */
export const METRICS_BATCH = 20

/**
 * O tipo da publicação: pelo formato do post e, quando a Meta disse, pelo
 * `media_type` (vídeo no feed é reels). `media_product_type` fica de fora: a
 * documentação o lista só para a API com login do Facebook.
 */
export function mediaKind(format: ContentFormat | string, mediaType?: string | null): MediaKind {
  if (format === "stories") return "story"
  if (format === "reels" || format === "video" || mediaType === "VIDEO") return "reels"
  return "feed"
}

/**
 * A leitura que vence agora, ou null. É sempre o último momento que já
 * passou, se ainda não foi lido e nenhum depois dele foi: momentos perdidos
 * (o job parado, o post ligado dias depois) ficam para trás, sem leitura.
 */
export function dueCheckpoint(kind: MediaKind, publishedAtMs: number, done: readonly string[], now: number): Checkpoint | null {
  const age = now - publishedAtMs
  if (!Number.isFinite(age) || age < 0) return null
  if (age >= (kind === "story" ? STORY_LIFETIME_MS : FEED_WINDOW_MS)) return null
  const steps = CHECKPOINTS[kind]
  const lastDone = steps.reduce((last, step, index) => (done.includes(step.checkpoint) ? index : last), -1)
  for (let index = steps.length - 1; index > lastDone; index--) {
    if (age >= steps[index]!.offsetMs) return steps[index]!.checkpoint
  }
  return null
}

/** Quando será a próxima leitura (milissegundos), ou null se a coleta acabou. */
export function nextCollectionAt(kind: MediaKind, publishedAtMs: number, done: readonly string[], now: number): number | null {
  if (!Number.isFinite(publishedAtMs)) return null
  const end = publishedAtMs + (kind === "story" ? STORY_LIFETIME_MS : FEED_WINDOW_MS)
  if (now >= end) return null
  if (dueCheckpoint(kind, publishedAtMs, done, now)) return now
  const steps = CHECKPOINTS[kind]
  const lastDone = steps.reduce((last, step, index) => (done.includes(step.checkpoint) ? index : last), -1)
  const next = steps.find((step, index) => index > lastDone && publishedAtMs + step.offsetMs > now)
  return next ? publishedAtMs + next.offsetMs : null
}

/** Candidato da rodada, como o banco devolve (instagram_metrics_due). */
export interface MetricsCandidate {
  post_id: string
  client_id: string
  media_id: string
  format: string
  published_at: string
  done: string[]
}

/** Os posts com leitura vencida, stories primeiro (somem), depois os mais antigos; até `limit`. */
export function pickDue(
  candidates: readonly MetricsCandidate[],
  now: number,
  limit = METRICS_BATCH
): { candidate: MetricsCandidate; checkpoint: Checkpoint }[] {
  return candidates
    .flatMap((candidate) => {
      const checkpoint = dueCheckpoint(mediaKind(candidate.format), Date.parse(candidate.published_at), candidate.done, now)
      return checkpoint ? [{ candidate, checkpoint }] : []
    })
    .sort((a, b) => {
      const story = Number(b.candidate.format === "stories") - Number(a.candidate.format === "stories")
      return story || Date.parse(a.candidate.published_at) - Date.parse(b.candidate.published_at)
    })
    .slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Pedidos e respostas da Meta                                         */
/* ------------------------------------------------------------------ */

/** Campos lidos da publicação antes das métricas. */
export const MEDIA_FIELDS = "id,media_type,like_count,comments_count,permalink,timestamp"

/** Métricas que existem nos três tipos (feed, reels e stories). */
export const COMMON_METRICS = ["views", "reach", "shares", "total_interactions"] as const

/**
 * Métricas pedidas por tipo, só as que a Meta lista para ele (uma métrica que
 * não vale para o tipo pode derrubar o pedido inteiro). `impressions` e
 * `plays` saíram: a Meta trocou por `views`.
 */
export const INSIGHT_METRICS: Record<MediaKind, readonly string[]> = {
  feed: [...COMMON_METRICS, "likes", "comments", "saved", "follows", "profile_visits"],
  reels: [...COMMON_METRICS, "likes", "comments", "saved", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
  story: [...COMMON_METRICS, "follows", "profile_visits", "replies", "navigation"],
}

/** Os valores de uma leitura, com os nomes das colunas do banco. */
export interface MetricValues {
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

export const EMPTY_VALUES: MetricValues = {
  views: null,
  reach: null,
  likes: null,
  comments: null,
  saved: null,
  shares: null,
  total_interactions: null,
  follows: null,
  profile_visits: null,
  replies: null,
  navigation: null,
  avg_watch_time_ms: null,
  total_watch_time_ms: null,
}

function record(json: unknown): Record<string, unknown> | null {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function text(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null
}

/** Data da Meta (`2026-10-27T15:00:00+0000`) em ISO que o JavaScript lê (`+00:00`), ou null. */
export function metaTimestamp(value: unknown): string | null {
  const raw = text(value, 40)
  if (!raw) return null
  const iso = raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/** Campos da publicação (GET /{ig-media-id}). */
export interface MediaFields {
  id: string
  mediaType: string | null
  likeCount: number | null
  commentsCount: number | null
  permalink: string | null
  timestamp: string | null
}

export function parseMediaFields(json: unknown): MediaFields | null {
  const data = record(json)
  const id = text(data?.id, 64)
  if (!data || !id) return null
  const permalink = text(data.permalink, 500)
  return {
    id,
    mediaType: text(data.media_type, 40),
    likeCount: count(data.like_count),
    commentsCount: count(data.comments_count),
    permalink: permalink?.startsWith("https://") ? permalink : null,
    timestamp: metaTimestamp(data.timestamp),
  }
}

/**
 * Métricas (GET /{ig-media-id}/insights): `{ data: [{ name, values: [{ value }] }] }`,
 * ou `total_value.value`. Métrica sem dado vem vazia (não zero) e fica de fora.
 */
export function parseInsights(json: unknown): Record<string, number> | null {
  const data = record(json)?.data
  if (!Array.isArray(data)) return null
  const result: Record<string, number> = {}
  for (const item of data) {
    const row = record(item)
    const name = text(row?.name, 80)
    if (!row || !name) continue
    const values = Array.isArray(row.values) ? row.values : []
    const value = count(record(values[0])?.value) ?? count(record(row.total_value)?.value)
    if (value !== null) result[name] = value
  }
  return result
}

/** Junta os campos e as métricas nos nomes do banco. Curtidas e comentários caem nos campos se as métricas não vierem. */
export function metricValues(fields: MediaFields | null, insights: Record<string, number> | null): MetricValues {
  const get = (name: string) => insights?.[name] ?? null
  // A Meta devolve o tempo de reels em milissegundos.
  return {
    views: get("views"),
    reach: get("reach"),
    likes: get("likes") ?? fields?.likeCount ?? null,
    comments: get("comments") ?? fields?.commentsCount ?? null,
    saved: get("saved"),
    shares: get("shares"),
    total_interactions: get("total_interactions"),
    follows: get("follows"),
    profile_visits: get("profile_visits"),
    replies: get("replies"),
    navigation: get("navigation"),
    avg_watch_time_ms: get("ig_reels_avg_watch_time"),
    total_watch_time_ms: get("ig_reels_video_view_total_time"),
  }
}

/** Código do erro da Meta (`error.code`), ou null. */
export function metaErrorCode(json: unknown): number | null {
  const code = record(record(json)?.error)?.code
  return typeof code === "number" ? code : null
}

/** Story com menos de 5 visualizações: a Meta responde com o erro 10. */
export const NOT_ENOUGH_VIEWERS_CODE = 10

/** Publicação da conta, para ligar a um post (GET /{ig-user-id}/media). */
export interface AccountMedia {
  id: string
  caption: string | null
  mediaType: string | null
  /** Imagem para a miniatura: `thumbnail_url` no vídeo, `media_url` nos outros. */
  thumbnailUrl: string | null
  permalink: string | null
  timestamp: string | null
}

/** Campos da lista. `caption` pode não vir com o login do Instagram: o app pede de novo sem ela. */
export const ACCOUNT_MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"
export const ACCOUNT_MEDIA_FIELDS_NO_CAPTION = "id,media_type,media_url,thumbnail_url,permalink,timestamp"
/** Quantas publicações recentes mostrar para escolher. */
export const ACCOUNT_MEDIA_LIMIT = 24

export function parseAccountMedia(json: unknown): AccountMedia[] | null {
  const data = record(json)?.data
  if (!Array.isArray(data)) return null
  return data.flatMap((item) => {
    const row = record(item)
    const id = text(row?.id, 64)
    if (!row || !id) return []
    const thumb = text(row.thumbnail_url) ?? text(row.media_url)
    const permalink = text(row.permalink, 500)
    return [
      {
        id,
        caption: text(row.caption, 5000),
        mediaType: text(row.media_type, 40),
        thumbnailUrl: thumb?.startsWith("https://") ? thumb : null,
        permalink: permalink?.startsWith("https://") ? permalink : null,
        timestamp: metaTimestamp(row.timestamp),
      },
    ]
  })
}

/** Começo da legenda, numa linha. */
export function captionStart(caption: string | null, max = 90): string {
  const line = (caption ?? "").replace(/\s+/g, " ").trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/* ------------------------------------------------------------------ */
/* Números nas telas                                                   */
/* ------------------------------------------------------------------ */

/** Leitura como as telas usam (última de cada post ou a série). */
export interface MetricReading extends MetricValues {
  post_id: string
  checkpoint: Checkpoint
  collected_at: string
  media_kind: MediaKind
}

/** Interações: o total da Meta, ou a soma de curtidas, comentários, salvos e compartilhamentos. */
export function interactionsOf(values: MetricValues): number | null {
  if (values.total_interactions !== null) return values.total_interactions
  const parts = [values.likes, values.comments, values.saved, values.shares].filter((value): value is number => value !== null)
  return parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null
}

/** Ordem dos momentos, para a evolução. */
const CHECKPOINT_ORDER: readonly Checkpoint[] = ["1h", "12h", "23h", "24h", "3d", "7d", "30d"]

/** A série de um post na ordem dos momentos. */
export function evolution<T extends Pick<MetricReading, "checkpoint">>(readings: readonly T[]): T[] {
  return [...readings].sort((a, b) => CHECKPOINT_ORDER.indexOf(a.checkpoint) - CHECKPOINT_ORDER.indexOf(b.checkpoint))
}

/** Resumo de um conjunto de posts publicados (cliente nos últimos 30 dias, relatório). */
export interface MetricsSummary {
  /** Posts publicados no Instagram no período. */
  posts: number
  /** Desses, quantos têm leitura. */
  measured: number
  views: number | null
  /** Alcance médio por post com leitura. */
  avgReach: number | null
  interactions: number | null
  /** O de mais visualizações (empate: mais interações). */
  best: { postId: string; views: number | null; interactions: number | null } | null
}

export function summarize(postIds: readonly string[], latest: readonly MetricReading[]): MetricsSummary {
  const byPost = new Map(latest.map((reading) => [reading.post_id, reading]))
  const readings = postIds.flatMap((id) => {
    const reading = byPost.get(id)
    return reading ? [reading] : []
  })
  const sum = (values: (number | null)[]) => {
    const present = values.filter((value): value is number => value !== null)
    return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null
  }
  const reaches = readings.map((reading) => reading.reach).filter((value): value is number => value !== null)
  let best: MetricsSummary["best"] = null
  for (const reading of readings) {
    const candidate = { postId: reading.post_id, views: reading.views, interactions: interactionsOf(reading) }
    if (
      !best ||
      (candidate.views ?? -1) > (best.views ?? -1) ||
      ((candidate.views ?? -1) === (best.views ?? -1) && (candidate.interactions ?? -1) > (best.interactions ?? -1))
    ) {
      best = candidate
    }
  }
  return {
    posts: postIds.length,
    measured: readings.length,
    views: sum(readings.map((reading) => reading.views)),
    avgReach: reaches.length > 0 ? reaches.reduce((total, value) => total + value, 0) / reaches.length : null,
    interactions: sum(readings.map(interactionsOf)),
    best,
  }
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

/** Número curto para o feed: 1234 → "1,2 mil"; null → "—". */
export function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return compact.format(value).replace(/ /g, " ")
}

/** Tempo médio de reels: 4300 ms → "4,3 s". */
export function formatWatchTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—"
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}
