import { addDaysToKey, capitalize, formatShortDate, formatWeekdayLong, toDateKey, toTimeLabel } from "@/lib/dates"
import { includesText } from "@/lib/text"
import type {
  Channel,
  Client,
  Communication,
  ContentFormat,
  ContentStage,
  DateKey,
  Message,
  Profile,
  Timestamp,
} from "@/lib/types"

/*
 * Regras dos canais (Comunicações): nome de cada canal, grupos da lista,
 * pendentes, o fio com os registros antigos e o título da tarefa de um
 * pedido. Funções puras.
 */

/** A conversa aberta pergunta ao servidor a cada tanto (sem Realtime). */
export const THREAD_POLL_MS = 4000
/** Não lidas na barra lateral. */
export const UNREAD_POLL_MS = 30000
/** Mensagens por página do fio. */
export const THREAD_PAGE = 100
export const BODY_MAX = 5000
export const CHANNEL_NAME_MAX = 60
const TASK_TITLE_MAX = 200
/** Mensagens comuns seguidas da mesma pessoa, em até 5 minutos, ficam juntas. */
const GROUP_GAP_MS = 5 * 60 * 1000

/** Post de que a mensagem fala (o cartão no fio). */
export interface MessagePost {
  id: string
  client_id: string
  title: string
  stage: ContentStage
  format: ContentFormat
  cover_path: string | null
  publish_on: DateKey | null
}

/** Projeto de que a mensagem fala (o cartão no fio). */
export interface MessageProject {
  id: string
  name: string
}

export interface ThreadMessage extends Message {
  post: MessagePost | null
  project: MessageProject | null
}

export interface ChannelCounts {
  unread: number
  pending: number
  last_message_at: Timestamp | null
}

export const NO_COUNTS: ChannelCounts = { unread: 0, pending: 0, last_message_at: null }

/** Canal da lista: participantes (internos e diretos) e contagens. */
export interface ChannelEntry extends Channel {
  member_ids: string[]
  counts: ChannelCounts
}

/** Uma página do fio (as mais recentes, em ordem) e todos os pedidos pendentes do canal. */
export interface ThreadData {
  messages: ThreadMessage[]
  hasMore: boolean
  pending: ThreadMessage[]
}

/** Pedido pendente com o canal (tela Hoje). */
export interface PendingRequest extends ThreadMessage {
  channel: Pick<Channel, "id" | "kind" | "client_id" | "name" | "archived">
}

export function isPending(message: Pick<Message, "kind" | "resolved_at">): boolean {
  return message.kind === "change_request" && message.resolved_at === null
}

/* ------------------------------------------------------------------ */
/* Nomes e grupos                                                      */
/* ------------------------------------------------------------------ */

interface NameContext {
  clientById: Map<string, Client>
  profileById: Map<string, Profile>
  me: string
}

/** A outra pessoa da conversa direta (ou a própria, se ficou sozinha). */
export function directPartner(channel: ChannelEntry, me: string): string | null {
  return channel.member_ids.find((id) => id !== me) ?? channel.member_ids[0] ?? null
}

/** Nome curto, para a lista: o cliente, o assunto ou a outra pessoa. */
export function channelLabel(channel: ChannelEntry, ctx: NameContext): string {
  if (channel.kind === "client") {
    return (channel.client_id ? ctx.clientById.get(channel.client_id)?.name : null) ?? channel.name ?? "Cliente"
  }
  if (channel.kind === "direct") {
    const partner = directPartner(channel, ctx.me)
    return (partner ? ctx.profileById.get(partner)?.full_name : null) ?? "Conversa"
  }
  return channel.name ?? "Canal"
}

/** Nome do cabeçalho: "Alterações – Cliente", o assunto ou a outra pessoa. */
export function channelTitle(channel: ChannelEntry, ctx: NameContext): string {
  if (channel.kind === "client") return channel.name ?? `Alterações – ${channelLabel(channel, ctx)}`
  return channelLabel(channel, ctx)
}

export interface ChannelGroups {
  clients: ChannelEntry[]
  internal: ChannelEntry[]
  direct: ChannelEntry[]
  /** Arquivados e os canais de clientes inativos. */
  archived: ChannelEntry[]
}

export function groupChannels(channels: ChannelEntry[], ctx: NameContext): ChannelGroups {
  const groups: ChannelGroups = { clients: [], internal: [], direct: [], archived: [] }
  const byLabel = (a: ChannelEntry, b: ChannelEntry) => channelLabel(a, ctx).localeCompare(channelLabel(b, ctx), "pt-BR")
  for (const channel of channels) {
    const inactiveClient =
      channel.kind === "client" && channel.client_id !== null && ctx.clientById.get(channel.client_id)?.active === false
    if (channel.archived || inactiveClient) groups.archived.push(channel)
    else if (channel.kind === "client") groups.clients.push(channel)
    else if (channel.kind === "internal") groups.internal.push(channel)
    else groups.direct.push(channel)
  }
  groups.clients.sort(byLabel)
  groups.internal.sort(byLabel)
  groups.direct.sort(byLabel)
  groups.archived.sort(byLabel)
  return groups
}

/** Não lidas e pendentes de todos os canais ativos (a barra lateral e o Hoje). */
export function totalsOf(channels: Pick<ChannelEntry, "archived" | "counts">[]): { unread: number; pending: number } {
  let unread = 0
  let pending = 0
  for (const channel of channels) {
    if (channel.archived) continue
    unread += channel.counts.unread
    pending += channel.counts.pending
  }
  return { unread, pending }
}

/* ------------------------------------------------------------------ */
/* Fio                                                                 */
/* ------------------------------------------------------------------ */

export type ThreadItem =
  | { type: "message"; key: string; at: Timestamp; message: ThreadMessage; continued: boolean }
  | { type: "communication"; key: string; at: Timestamp; communication: Communication }

export interface ThreadDay {
  day: DateKey
  label: string
  items: ThreadItem[]
}

/**
 * Quando um registro antigo entra no fio: no dia em que aconteceu, na hora
 * em que foi registrado (se foi registrado no mesmo dia) ou ao meio-dia.
 */
export function communicationInstant(communication: Communication): Timestamp {
  if (toDateKey(communication.created_at) === communication.occurred_on) return communication.created_at
  return new Date(`${communication.occurred_on}T12:00:00-03:00`).toISOString()
}

/** "Hoje", "Ontem", "Segunda-feira, 05/10". */
export function threadDayLabel(day: DateKey, today: DateKey): string {
  if (day === today) return "Hoje"
  if (day === addDaysToKey(today, -1)) return "Ontem"
  return `${capitalize(formatWeekdayLong(day))}, ${formatShortDate(day, today)}`
}

/** Mensagens e registros antigos em ordem, por dia, com as mensagens seguidas agrupadas. */
export function buildThread(messages: ThreadMessage[], communications: Communication[], today: DateKey): ThreadDay[] {
  const items: ThreadItem[] = [
    ...messages.map((message) => ({
      type: "message" as const,
      key: message.id,
      at: message.created_at,
      message,
      continued: false,
    })),
    ...communications.map((communication) => ({
      type: "communication" as const,
      key: `c:${communication.id}`,
      at: communicationInstant(communication),
      communication,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))

  const days: ThreadDay[] = []
  let previous: ThreadItem | null = null
  for (const item of items) {
    const day = toDateKey(item.at)
    let current = days[days.length - 1]
    if (!current || current.day !== day) {
      current = { day, label: threadDayLabel(day, today), items: [] }
      days.push(current)
      previous = null
    }
    if (
      item.type === "message" &&
      previous?.type === "message" &&
      previous.message.author_id === item.message.author_id &&
      previous.message.kind === "text" &&
      item.message.kind === "text" &&
      Date.parse(item.at) - Date.parse(previous.at) < GROUP_GAP_MS
    ) {
      item.continued = true
    }
    current.items.push(item)
    previous = item
  }
  return days
}

/** Junta a página nova com as anteriores já carregadas (a versão nova de cada mensagem vale). */
export function mergeMessages(older: ThreadMessage[], latest: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>()
  for (const message of older) byId.set(message.id, message)
  for (const message of latest) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function filterThread(messages: ThreadMessage[], query: string): ThreadMessage[] {
  return query.trim() ? messages.filter((message) => includesText(message.body, query)) : messages
}

export function filterCommunications(communications: Communication[], query: string): Communication[] {
  return query.trim()
    ? communications.filter((item) => includesText(`${item.summary}\n${item.details ?? ""}`, query))
    : communications
}

export function messageTime(message: Pick<Message, "created_at">): string {
  return toTimeLabel(message.created_at)
}

/** Título da tarefa de um pedido: a primeira linha, até 200 letras. */
export function taskTitleFrom(body: string): string {
  const firstLine = body.split("\n").find((line) => line.trim()) ?? body
  const text = firstLine.replace(/\s+/g, " ").trim()
  if (text.length <= TASK_TITLE_MAX) return text
  const cut = text.slice(0, TASK_TITLE_MAX - 1)
  const space = cut.lastIndexOf(" ")
  return `${space > TASK_TITLE_MAX / 2 ? cut.slice(0, space) : cut}…`
}

/** Endereço do canal (e da visão de pendentes). */
export function channelHref(channelId: string, view?: "pendentes"): string {
  return `/comunicacoes?canal=${channelId}${view ? `&ver=${view}` : ""}`
}
