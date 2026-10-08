import type { Progress } from "@/features/tasks/logic"
import {
  addDaysToKey,
  capitalize,
  daysBetween,
  formatShortDate,
  formatWeekdayShort,
  isWithin,
  toDateKey,
  type DateRange,
} from "@/lib/dates"
import { CONTENT_FRONT_LABEL, CONTENT_FRONTS, CONTENT_STAGES } from "@/lib/labels"
import type {
  ContentFormat,
  ContentFront,
  ContentFrontStatus,
  ContentNetwork,
  ContentPost,
  ContentStage,
  DateKey,
} from "@/lib/types"
import { isUuid } from "@/lib/utils"

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
 * - Tarefas das frentes: uma por frente que falta, com prazo antes da
 *   publicação (copy D-5, design e vídeo D-3), nunca antes de hoje.
 * - Feed (preview do Instagram): só os posts do Instagram que não são
 *   stories; até 3 fixados por cliente.
 */

/* ------------------------------------------------------------------ */
/* Resumo (listas)                                                     */
/* ------------------------------------------------------------------ */

/** Textos longos do post: ficam fora das listas e são lidos ao abrir o post. */
export const POST_TEXT_FIELDS = ["brief", "design_notes", "script", "slides", "caption"] as const
export type PostTextField = (typeof POST_TEXT_FIELDS)[number]
/** O post sem os textos longos (calendário, quadro, listas e cartões). */
export type PostSummary = Omit<ContentPost, PostTextField>
export type PostTexts = Pick<ContentPost, PostTextField>

/**
 * Cor estável de um cliente, derivada do id (sem coluna no banco): índice de
 * 0 a `size - 1`, sempre o mesmo para o mesmo cliente.
 */
export function clientColorIndex(clientId: string, size: number): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < clientId.length; index += 1) {
    hash ^= clientId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % size
}

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

/** Reels, vídeo e stories: a orientação é de vídeo, não de design. */
export function isVideoFormat(format: ContentFormat): boolean {
  return VIDEO_FORMATS.includes(format)
}

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

/** O que falta produzir: frentes que o post precisa e ainda não foram finalizadas. */
export function pendingFronts(post: FrontStatuses): ContentFront[] {
  return CONTENT_FRONTS.filter((front) => {
    const status = frontStatus(post, front)
    return status !== "not_needed" && status !== "done"
  })
}

/* ------------------------------------------------------------------ */
/* Tarefas das frentes                                                 */
/* ------------------------------------------------------------------ */

/** Quantos dias antes da publicação vence a tarefa de cada frente. */
export const FRONT_TASK_LEAD_DAYS: Record<ContentFront, number> = { copy: 5, design: 3, video: 3 }

/**
 * Prazo da tarefa de uma frente: a publicação menos a antecedência da frente
 * (copy D-5, design e vídeo D-3). Se esse dia já passou, hoje. Sem data de
 * publicação, sem prazo.
 */
export function frontTaskDue(publishOn: DateKey | null, front: ContentFront, today: DateKey): DateKey | null {
  if (publishOn === null) return null
  const due = addDaysToKey(publishOn, -FRONT_TASK_LEAD_DAYS[front])
  return due < today ? today : due
}

const FRONT_TASK_SEPARATOR = " — "

/** "Copy — Carrossel de dicas", cortado no limite de título das tarefas. */
export function frontTaskTitle(front: ContentFront, postTitle: string, max = 200): string {
  const title = `${CONTENT_FRONT_LABEL[front]}${FRONT_TASK_SEPARATOR}${postTitle}`
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title
}

/** Frente de uma tarefa gerada, pelo começo do título (null se foi renomeada). */
export function frontOfTaskTitle(title: string): ContentFront | null {
  return CONTENT_FRONTS.find((front) => title.startsWith(`${CONTENT_FRONT_LABEL[front]}${FRONT_TASK_SEPARATOR}`)) ?? null
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

/** Quantos dias de publicados o quadro mostra. */
export const BOARD_PUBLISHED_DAYS = 30

/**
 * Colunas do quadro da visão central: as etapas em ordem de data e, em
 * Publicado, só os dos últimos 30 dias (o mais recente primeiro).
 */
export function boardColumns<T extends Sortable & Pick<ContentPost, "stage" | "published_at">>(
  posts: readonly T[],
  today: DateKey
): Record<ContentStage, T[]> {
  const columns = groupByStage(posts)
  const since = addDaysToKey(today, -BOARD_PUBLISHED_DAYS)
  columns.published = columns.published
    .filter((post) => (post.published_at ? toDateKey(post.published_at) : post.publish_on ?? today) >= since)
    .reverse()
  return columns
}

/** "Hoje", "Amanhã", "Ontem", "Qua, 14/10" (com o ano quando é outro); com o horário, "Hoje · 18:00". */
export function publishLabel(post: Pick<ContentPost, "publish_on" | "publish_time">, today: DateKey): string {
  if (post.publish_on === null) return "Sem data"
  const diff = daysBetween(today, post.publish_on)
  const day =
    diff === 0
      ? "Hoje"
      : diff === 1
        ? "Amanhã"
        : diff === -1
          ? "Ontem"
          : post.publish_on.slice(0, 4) === today.slice(0, 4)
            ? `${capitalize(formatWeekdayShort(post.publish_on))}, ${formatShortDate(post.publish_on)}`
            : formatShortDate(post.publish_on, today)
  return post.publish_time ? `${day} · ${post.publish_time.slice(0, 5)}` : day
}

type Dated = Sortable & Pick<ContentPost, "stage">

export interface UpcomingPosts<T> {
  /** Data passou e não foi programado nem publicado. */
  late: T[]
  /** Os dias (de hoje em diante) que têm post, em ordem. */
  days: { day: DateKey; posts: T[] }[]
}

/** Lista "Próximos 7 dias": os atrasados e os posts de hoje até daqui a 6 dias. */
export function upcomingPosts<T extends Dated>(posts: readonly T[], today: DateKey, length = 7): UpcomingPosts<T> {
  const late = posts.filter((post) => isLate(post, today)).sort(comparePosts)
  const byDay = groupByDay(postsInRange(posts, { start: today, end: addDaysToKey(today, length - 1) }))
  return { late, days: [...byDay].map(([day, list]) => ({ day, posts: list })) }
}

export interface TodayContent<T> {
  late: T[]
  /** Saem hoje e ainda não foram publicados. */
  today: T[]
  /** Com o cliente para aprovar (fora os que já estão nas duas listas acima). */
  awaitingClient: T[]
}

/** Quadro "Conteúdo" da tela Hoje. Cada post aparece numa lista só. */
export function todayContent<T extends Dated>(posts: readonly T[], today: DateKey): TodayContent<T> {
  const late = posts.filter((post) => isLate(post, today)).sort(comparePosts)
  const dueToday = posts.filter((post) => post.publish_on === today && post.stage !== "published").sort(comparePosts)
  const listed = new Set([...late, ...dueToday])
  const awaitingClient = posts.filter((post) => post.stage === "client_review" && !listed.has(post)).sort(comparePosts)
  return { late, today: dueToday, awaitingClient }
}

/** Próximos posts (página do cliente): os que não foram publicados, atrasados primeiro e sem data no fim. */
export function nextPosts<T extends Dated>(posts: readonly T[]): T[] {
  return posts.filter((post) => post.stage !== "published").sort(comparePosts)
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

/** Quantos posts de um cliente podem ficar fixados no topo do feed (como no Instagram). */
export const MAX_PINNED = 3

/** Filtro do preview: tudo o que está planejado ou só o que o cliente já aprovou. */
export type FeedFilter = "planned" | "approved"

/** Etapas que contam como aprovadas no filtro do feed. */
const APPROVED_STAGES: readonly ContentStage[] = ["approved", "scheduled", "published"]

/** Vai para o grid do Instagram: sai no Instagram e não é story (stories não ficam no perfil). */
export function isFeedPost(post: Pick<ContentPost, "format" | "networks">): boolean {
  return post.format !== "stories" && post.networks.includes("instagram")
}

type FeedCandidate = FeedSortable & Pick<ContentPost, "client_id" | "format" | "networks" | "stage">

/** Os quadrados do feed de um cliente, já na ordem do grid (`feedOrder`). */
export function feedPosts<T extends FeedCandidate>(posts: readonly T[], clientId: string, filter: FeedFilter): T[] {
  return feedOrder(
    posts.filter(
      (post) =>
        post.client_id === clientId &&
        isFeedPost(post) &&
        (filter === "planned" || APPROVED_STAGES.includes(post.stage))
    )
  )
}

/** Posts fixados do cliente (para conferir o limite antes de fixar mais um). */
export function pinnedCount(posts: readonly Pick<ContentPost, "client_id" | "pinned">[], clientId: string): number {
  return posts.filter((post) => post.pinned && post.client_id === clientId).length
}

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

/* ------------------------------------------------------------------ */
/* Imagens                                                             */
/* ------------------------------------------------------------------ */

/**
 * Caminho de uma imagem no bucket privado `content`: `<client_id>/<arquivo>`,
 * os dois UUIDs (o arquivo é sorteado pelo servidor no envio).
 */
export function isContentImagePath(value: unknown): value is string {
  if (typeof value !== "string") return false
  const parts = value.split("/")
  return parts.length === 2 && parts.every(isUuid)
}

/** Endereço estável da imagem no app: confere a sessão e redireciona para uma URL assinada. */
export function contentImageUrl(path: string): string {
  return `/api/conteudo/${path}`
}

/** Imagens de um post (capa e slides), sem repetir. */
export function postImagePaths(post: Pick<ContentPost, "cover_path" | "slides">): string[] {
  const paths = [post.cover_path, ...post.slides.map((slide) => slide.image_path)]
  return [...new Set(paths.filter((path): path is string => path !== null))]
}

/** Imagens que saíram: estavam antes e não estão depois (o arquivo pode ser apagado). */
export function removedImages(before: readonly string[], after: readonly string[]): string[] {
  return before.filter((path) => !after.includes(path))
}
