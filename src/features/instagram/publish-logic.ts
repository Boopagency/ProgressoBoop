import type { ContentFormat, ContentNetwork, ContentSlide, ContentStage } from "@/lib/types"

/*
 * Regras puras da publicação automática no Instagram (PR 2/3 da issue #89),
 * conforme a documentação da Meta ("Content Publishing", API do Instagram com
 * login do Instagram): contêiner em POST /{ig-user-id}/media, publicação em
 * POST /{ig-user-id}/media_publish, status do contêiner em
 * GET /{container-id}?fields=status_code e o limite em
 * GET /{ig-user-id}/content_publishing_limit.
 *
 * Sem React, sem banco e sem imports de valor (só tipos), para o teste rodar
 * direto no Node: `node --test src/features/instagram/publish-logic.test.mjs`.
 */

/** O que sai sozinho: uma imagem no feed, um carrossel de imagens ou um story com imagem. */
export type PublishKind = "image" | "carousel" | "story"

/**
 * Formatos que publicam sozinhos. Reels e vídeo ficam de fora: o app ainda
 * não guarda vídeo (o bucket `content` só aceita imagem).
 */
const PUBLISH_KIND: Partial<Record<ContentFormat, PublishKind>> = {
  static: "image",
  photo: "image",
  carousel: "carousel",
  stories: "story",
}

export function publishKind(format: ContentFormat): PublishKind | null {
  return PUBLISH_KIND[format] ?? null
}

/** Etapas em que o post pode estar na fila (ligar leva para "Agendado"). */
export const AUTO_PUBLISH_STAGES: readonly ContentStage[] = ["approved", "scheduled"]

/** Carrossel: de 2 a 20 itens (Meta). */
export const CAROUSEL_MIN = 2
export const CAROUSEL_MAX = 20
/** Legenda: até 2.200 caracteres, 30 hashtags e 20 menções (Meta). */
export const CAPTION_LIMIT = 2200
export const HASHTAG_LIMIT = 30
export const MENTION_LIMIT = 20
/** Imagem: JPEG de até 8 MB (Meta). */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024
/** Feed e carrossel: proporção entre 4:5 (retrato) e 1,91:1 (paisagem). Stories aceitam qualquer uma (9:16 recomendado). */
export const FEED_RATIO_MIN = 4 / 5
export const FEED_RATIO_MAX = 1.91
/** Folga para arredondamento (1080 × 1350 dá 0,8 exato, 1079 × 1350 não deve cair fora). */
const RATIO_TOLERANCE = 0.005
/** Tentativas antes de desistir e avisar a equipe (a regra fica no banco: instagram_post_failed). */
export const MAX_PUBLISH_ATTEMPTS = 3
/** As URLs assinadas valem até 3 dias depois do horário (dá para as tentativas e um atraso do job). */
export const URL_MARGIN_MS = 3 * 24 * 60 * 60 * 1000
/** Contêiner da Meta vence em 24 h sem publicar; reaproveita só até 23 h. */
export const CONTAINER_REUSE_MS = 23 * 60 * 60 * 1000

/** O post como a publicação precisa dele. */
export interface PublishCandidate {
  format: ContentFormat
  networks: readonly ContentNetwork[]
  stage: ContentStage
  publish_on: string | null
  publish_time: string | null
  caption: string | null
  cover_path: string | null
  slides: readonly Pick<ContentSlide, "image_path">[]
}

/**
 * Imagens que vão para o Instagram, na ordem: a capa (imagem e story) ou as
 * imagens dos slides (carrossel; a capa do carrossel é só da equipe). Slide
 * sem imagem entra como null (e impede o agendamento).
 */
export function publishSourcePaths(post: Pick<PublishCandidate, "format" | "cover_path" | "slides">): (string | null)[] {
  const kind = publishKind(post.format)
  if (kind === "carousel") return post.slides.map((slide) => slide.image_path)
  if (kind === "image" || kind === "story") return [post.cover_path]
  return []
}

/** Hashtags (#palavra) e menções (@perfil) da legenda, como o Instagram conta. */
export function captionCounts(caption: string): { hashtags: number; mentions: number } {
  return {
    hashtags: (caption.match(/(^|[^\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu) ?? []).length,
    mentions: (caption.match(/(^|[^\p{L}\p{N}_.])@[A-Za-z0-9._]{1,30}/gu) ?? []).length,
  }
}

/** O que impede a legenda de sair, ou null. */
export function captionProblem(caption: string | null): string | null {
  const text = caption?.trim() ?? ""
  if (text.length > CAPTION_LIMIT) return `A legenda tem ${text.length} caracteres; o Instagram aceita até ${CAPTION_LIMIT}.`
  const { hashtags, mentions } = captionCounts(text)
  if (hashtags > HASHTAG_LIMIT) return `A legenda tem ${hashtags} hashtags; o Instagram aceita até ${HASHTAG_LIMIT}.`
  if (mentions > MENTION_LIMIT) return `A legenda marca ${mentions} perfis com @; o Instagram aceita até ${MENTION_LIMIT}.`
  return null
}

export interface PublishContext {
  /** A conta do Instagram do cliente está conectada e o token vale. */
  accountConnected: boolean
  /** Instante do horário de publicação (São Paulo → ms), ou null sem data e hora. */
  dueAt: number | null
  now: number
  /** Ao ligar: o horário precisa estar no futuro. */
  requireFuture?: boolean
}

/**
 * Por que o post não pode sair sozinho (vazio quando pode). As imagens em si
 * (formato, tamanho e proporção) são conferidas no servidor ao agendar.
 */
export function publishBlockers(post: PublishCandidate, context: PublishContext): string[] {
  const reasons: string[] = []
  const kind = publishKind(post.format)
  if (!post.networks.includes("instagram")) reasons.push("O post não está marcado para o Instagram.")
  if (!kind) {
    reasons.push(
      post.format === "reels" || post.format === "video"
        ? "Reels e vídeo não publicam sozinhos: o app ainda não guarda vídeo. Publique pelo Instagram."
        : "Post só de texto não vai para o Instagram."
    )
    return reasons
  }
  if (!AUTO_PUBLISH_STAGES.includes(post.stage)) reasons.push("O post precisa estar Aprovado ou Agendado.")
  if (!post.publish_on || !post.publish_time) reasons.push("Escolha o dia e o horário da publicação.")
  else if (context.requireFuture && context.dueAt !== null && context.dueAt <= context.now) {
    reasons.push("O horário da publicação já passou. Mude o dia ou o horário.")
  }
  if (!context.accountConnected) reasons.push("Conecte o Instagram do cliente (página do cliente → Instagram).")

  const sources = publishSourcePaths(post)
  if (kind === "carousel") {
    if (sources.length < CAROUSEL_MIN) reasons.push(`O carrossel precisa de pelo menos ${CAROUSEL_MIN} slides com imagem.`)
    else if (sources.length > CAROUSEL_MAX) reasons.push(`O carrossel pode ter até ${CAROUSEL_MAX} slides.`)
    const missing = sources.flatMap((path, index) => (path ? [] : [index + 1]))
    if (missing.length > 0) {
      reasons.push(
        missing.length === 1 ? `O slide ${missing[0]} está sem imagem.` : `Os slides ${missing.join(", ")} estão sem imagem.`
      )
    }
  } else if (!sources[0]) {
    reasons.push(kind === "story" ? "Envie a imagem do story (a capa)." : "Envie a imagem do post (a capa).")
  }
  if (kind !== "story") {
    const problem = captionProblem(post.caption)
    if (problem) reasons.push(problem)
  }
  return reasons
}

export interface ImageInfo {
  width: number
  height: number
  bytes: number
}

/** "4:5", "1,91:1": a proporção em texto para a mensagem. */
function ratioLabel(width: number, height: number): string {
  const ratio = width / height
  const known: [number, string][] = [
    [9 / 16, "9:16"],
    [2 / 3, "2:3"],
    [3 / 4, "3:4"],
    [4 / 5, "4:5"],
    [1, "1:1"],
    [16 / 9, "16:9"],
  ]
  const match = known.find(([value]) => Math.abs(value - ratio) < 0.01)
  return match ? match[1] : `${ratio.toFixed(2).replace(".", ",")}:1`
}

/**
 * O que impede a imagem (já em JPEG) de ir para o Instagram, ou null.
 * `label` diz qual é ("A capa", "O slide 3").
 */
export function imageProblem(image: ImageInfo, kind: PublishKind, label: string): string | null {
  if (!(image.width > 0 && image.height > 0)) return `${label}: não deu para ler a imagem.`
  if (image.bytes > IMAGE_MAX_BYTES) return `${label} passa de 8 MB, o limite do Instagram.`
  if (kind !== "story") {
    const ratio = image.width / image.height
    if (ratio < FEED_RATIO_MIN - RATIO_TOLERANCE || ratio > FEED_RATIO_MAX + RATIO_TOLERANCE) {
      return `${label} está em ${ratioLabel(image.width, image.height)} (${image.width} × ${image.height}); no feed, o Instagram só aceita de 4:5 (retrato, ex.: 1080 × 1350) a 1,91:1 (paisagem). Recorte e envie de novo.`
    }
  }
  return null
}

/** Até quando as URLs assinadas das imagens precisam valer. */
export function urlsExpireAt(dueAt: number, now: number): number {
  return Math.max(dueAt, now) + URL_MARGIN_MS
}

/** Parâmetros de um contêiner (POST /{ig-user-id}/media), sem o token. */
export type ContainerParams = Record<string, string>

export interface ContainerPlan {
  /** Itens do carrossel, criados antes (vazio em imagem e story). */
  children: ContainerParams[]
  /** O contêiner que é publicado. No carrossel, recebe `children` com os ids dos itens. */
  parent: ContainerParams
}

/**
 * Contêineres de um post: imagem com legenda; story (`media_type=STORIES`,
 * sem legenda, que a Meta não aceita em story); carrossel com um item por
 * imagem (`is_carousel_item=true`, sem legenda) e o contêiner `CAROUSEL` com
 * a legenda.
 */
export function containerPlan(kind: PublishKind, imageUrls: readonly string[], caption: string | null): ContainerPlan {
  const text = caption?.trim() ?? ""
  const withCaption = (params: ContainerParams): ContainerParams => (text ? { ...params, caption: text } : params)
  if (kind === "story") return { children: [], parent: { image_url: imageUrls[0] ?? "", media_type: "STORIES" } }
  if (kind === "image") return { children: [], parent: withCaption({ image_url: imageUrls[0] ?? "" }) }
  return {
    children: imageUrls.map((url) => ({ image_url: url, is_carousel_item: "true" })),
    parent: withCaption({ media_type: "CAROUSEL" }),
  }
}

/** O contêiner do carrossel com os ids dos itens, na ordem. */
export function withChildren(parent: ContainerParams, childIds: readonly string[]): ContainerParams {
  return { ...parent, children: childIds.join(",") }
}

export type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED"
const CONTAINER_STATUSES: readonly ContainerStatus[] = ["FINISHED", "IN_PROGRESS", "ERROR", "EXPIRED", "PUBLISHED"]

/** `status_code` do contêiner. */
export function parseContainerStatus(json: unknown): ContainerStatus | null {
  if (!json || typeof json !== "object") return null
  const status = (json as { status_code?: unknown }).status_code
  return CONTAINER_STATUSES.includes(status as ContainerStatus) ? (status as ContainerStatus) : null
}

/** `{ id }` da criação do contêiner ou da publicação. */
export function parseId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const id = (json as { id?: unknown }).id
  if (typeof id === "number") return String(id)
  return typeof id === "string" && /^\d{1,64}$/.test(id) ? id : null
}

/** Quantos posts a conta já publicou pela API nas últimas 24 h e o limite (content_publishing_limit). */
export function parsePublishingLimit(json: unknown): { usage: number; total: number } | null {
  if (!json || typeof json !== "object") return null
  const row = (json as { data?: unknown }).data
  const first = Array.isArray(row) ? row[0] : null
  if (!first || typeof first !== "object") return null
  const usage = (first as { quota_usage?: unknown }).quota_usage
  const total = (first as { config?: { quota_total?: unknown } }).config?.quota_total
  if (typeof usage !== "number" || typeof total !== "number" || total <= 0) return null
  return { usage, total }
}

/** Link público do post publicado (`permalink`), só do Instagram. */
export function parsePermalink(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const link = (json as { permalink?: unknown }).permalink
  if (typeof link !== "string" || link.length > 500) return null
  return /^https:\/\/(www\.)?instagram\.com\//.test(link) ? link : null
}

/** O contêiner guardado de uma rodada anterior ainda serve (menos de 23 h). */
export function canReuseContainer(createdAt: string | null, now: number): boolean {
  if (!createdAt) return false
  const at = Date.parse(createdAt)
  return Number.isFinite(at) && now - at < CONTAINER_REUSE_MS
}
