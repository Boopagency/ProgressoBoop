import type { Progress } from "@/features/tasks/logic"
import { isWithin, type DateRange } from "@/lib/dates"
import { CONTENT_FRONTS, CONTENT_STAGES } from "@/lib/labels"
import type {
  ContentFormat,
  ContentFront,
  ContentFrontStatus,
  ContentNetwork,
  ContentPost,
  ContentStage,
  DateKey,
} from "@/lib/types"

/*
 * Regras da Central de Conteúdo: funções puras sobre os posts, sem React.
 *
 * - Cada formato usa alguns campos de texto: carrossel → slides e legenda;
 *   reels e vídeo → roteiro e legenda; stories → roteiro; estático, foto e
 *   texto → legenda.
 * - Frentes: copy, design e vídeo. "Não precisa" fica fora da conta do
 *   progresso; "Falta material" em qualquer frente bloqueia o post.
 * - Atrasado: o dia de publicação já passou e o post ainda não está
 *   programado nem publicado.
 * - Calendário e quadro: dia, depois horário (sem horário por último), depois
 *   título. Feed: fixados primeiro, depois a publicação mais recente; sem
 *   data no fim.
 */

/* ------------------------------------------------------------------ */
/* Formatos                                                            */
/* ------------------------------------------------------------------ */

export type ContentTextField = "slides" | "script" | "caption"

/** Campos de texto que cada formato usa (o formulário mostra só estes). */
export const FORMAT_TEMPLATES: Record<ContentFormat, readonly ContentTextField[]> = {
  reels: ["script", "caption"],
  carousel: ["slides", "caption"],
  static: ["caption"],
  stories: ["script"],
  video: ["script", "caption"],
  photo: ["caption"],
  text: ["caption"],
}

/** Limite de slides de um carrossel (o mesmo do banco). */
export const MAX_SLIDES = 20

export function formatUses(format: ContentFormat, field: ContentTextField): boolean {
  return FORMAT_TEMPLATES[format].includes(field)
}

/** Formatos com gravação ou edição de vídeo. */
const VIDEO_FORMATS: readonly ContentFormat[] = ["reels", "video", "stories"]

/* ------------------------------------------------------------------ */
/* Frentes                                                             */
/* ------------------------------------------------------------------ */

type FrontStatuses = Pick<ContentPost, "copy_status" | "design_status" | "video_status">

const FRONT_FIELD: Record<ContentFront, keyof FrontStatuses> = {
  copy: "copy_status",
  design: "design_status",
  video: "video_status",
}

export function frontStatus(post: FrontStatuses, front: ContentFront): ContentFrontStatus {
  return post[FRONT_FIELD[front]]
}

/**
 * Status inicial das frentes de um post novo: copy e design a fazer; vídeo a
 * fazer em reels, vídeo e stories e "não precisa" nos demais (a mesma regra
 * do trigger do banco).
 */
export function defaultFronts(format: ContentFormat): FrontStatuses {
  return {
    copy_status: "todo",
    design_status: "todo",
    video_status: VIDEO_FORMATS.includes(format) ? "todo" : "not_needed",
  }
}

/**
 * Frentes finalizadas sobre as que o post precisa ("não precisa" fica fora).
 * Sem nenhuma frente para fazer, o post está 100% pronto.
 */
export function frontProgress(post: FrontStatuses): Progress {
  const needed = CONTENT_FRONTS.filter((front) => frontStatus(post, front) !== "not_needed")
  const done = needed.filter((front) => frontStatus(post, front) === "done").length
  const total = needed.length
  return { done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100) }
}

/** Frentes paradas por falta de material do cliente. */
export function blockedFronts(post: FrontStatuses): ContentFront[] {
  return CONTENT_FRONTS.filter((front) => frontStatus(post, front) === "missing_material")
}

export function isBlocked(post: FrontStatuses): boolean {
  return blockedFronts(post).length > 0
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

/** Etapas em que o post já saiu das mãos da equipe. */
const OUT_STAGES: readonly ContentStage[] = ["scheduled", "published"]

/** O dia de publicação passou e o post ainda não foi programado nem publicado. */
export function isLate(post: Pick<ContentPost, "publish_on" | "stage">, today: DateKey): boolean {
  return post.publish_on !== null && post.publish_on < today && !OUT_STAGES.includes(post.stage)
}

/** Posts com publicação dentro do período (inclusive). Sem data fica de fora. */
export function postsInRange<T extends Pick<ContentPost, "publish_on">>(posts: readonly T[], range: DateRange): T[] {
  return posts.filter((post) => post.publish_on !== null && isWithin(post.publish_on, range))
}

type Sortable = Pick<ContentPost, "publish_on" | "publish_time" | "title">

/** Ordem de calendário: dia, horário (sem horário por último) e título. Sem data no fim. */
export function comparePosts(a: Sortable, b: Sortable): number {
  if (a.publish_on !== b.publish_on) {
    if (a.publish_on === null) return 1
    if (b.publish_on === null) return -1
    return a.publish_on < b.publish_on ? -1 : 1
  }
  if (a.publish_time !== b.publish_time) {
    if (a.publish_time === null) return 1
    if (b.publish_time === null) return -1
    return a.publish_time < b.publish_time ? -1 : 1
  }
  return a.title.localeCompare(b.title, "pt-BR")
}

/**
 * Posts por dia de publicação, em ordem de data e, dentro do dia, de horário.
 * Só os dias com posts aparecem; posts sem data ficam de fora.
 */
export function groupByDay<T extends Sortable>(posts: readonly T[]): Map<DateKey, T[]> {
  const days = new Map<DateKey, T[]>()
  for (const post of [...posts].sort(comparePosts)) {
    if (post.publish_on === null) continue
    const list = days.get(post.publish_on)
    if (list) list.push(post)
    else days.set(post.publish_on, [post])
  }
  return days
}

/** Colunas do quadro: todas as etapas, na ordem do fluxo (vazias inclusive). */
export function groupByStage<T extends Sortable & Pick<ContentPost, "stage">>(
  posts: readonly T[]
): Record<ContentStage, T[]> {
  const groups = Object.fromEntries(CONTENT_STAGES.map((stage) => [stage, [] as T[]])) as Record<ContentStage, T[]>
  for (const post of [...posts].sort(comparePosts)) groups[post.stage].push(post)
  return groups
}

/* ------------------------------------------------------------------ */
/* Filtros (visão central, com todos os clientes)                      */
/* ------------------------------------------------------------------ */

/** Filtro vazio (ou ausente) não restringe nada. */
export interface ContentFilters {
  clientIds?: readonly string[]
  ownerId?: string
  /** O post entra se sair em pelo menos uma das redes. */
  networks?: readonly ContentNetwork[]
  formats?: readonly ContentFormat[]
  stages?: readonly ContentStage[]
}

type Filterable = Pick<ContentPost, "client_id" | "owner_id" | "networks" | "format" | "stage">

export function filterPosts<T extends Filterable>(posts: readonly T[], filters: ContentFilters): T[] {
  const { clientIds, ownerId, networks, formats, stages } = filters
  return posts.filter((post) => {
    if (clientIds?.length && !clientIds.includes(post.client_id)) return false
    if (ownerId && post.owner_id !== ownerId) return false
    if (networks?.length && !post.networks.some((network) => networks.includes(network))) return false
    if (formats?.length && !formats.includes(post.format)) return false
    if (stages?.length && !stages.includes(post.stage)) return false
    return true
  })
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

type FeedSortable = Sortable & Pick<ContentPost, "pinned" | "created_at">

/**
 * Ordem do grid do feed: fixados primeiro; depois a publicação mais recente
 * primeiro (no mesmo dia, o horário mais tarde; sem horário depois); sem data
 * no fim; empate, o criado por último primeiro.
 */
export function feedOrder<T extends FeedSortable>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.publish_on !== b.publish_on) {
      if (a.publish_on === null) return 1
      if (b.publish_on === null) return -1
      return a.publish_on > b.publish_on ? -1 : 1
    }
    if (a.publish_time !== b.publish_time) {
      if (a.publish_time === null) return 1
      if (b.publish_time === null) return -1
      return a.publish_time > b.publish_time ? -1 : 1
    }
    return b.created_at.localeCompare(a.created_at)
  })
}
