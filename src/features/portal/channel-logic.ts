import { threadDayLabel } from "@/features/channels/logic"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import { toDateKey } from "@/lib/dates"
import type { DateKey, Timestamp } from "@/lib/types"

/*
 * Fio da Comunicação no portal: as mensagens por dia, as seguidas da mesma
 * pessoa juntas, como na conversa da equipe (`buildThread`). Funções puras.
 */

/** A Comunicação aberta pergunta ao servidor a cada tanto, com a aba visível. */
export const PORTAL_THREAD_POLL_MS = 5000
/** Mensagens comuns seguidas da mesma pessoa, em até 5 minutos, ficam juntas. */
const GROUP_GAP_MS = 5 * 60 * 1000

export interface PortalThreadItem {
  key: string
  at: Timestamp
  message: PortalChannelMessage
  /** Continua a mensagem anterior (mesma pessoa, logo depois): sem o nome de novo. */
  continued: boolean
}

export interface PortalThreadDay {
  day: DateKey
  label: string
  items: PortalThreadItem[]
}

/** Junta páginas do fio sem repetir (a versão mais nova de cada mensagem vale), em ordem. */
export function mergePortalMessages(
  older: readonly PortalChannelMessage[],
  latest: readonly PortalChannelMessage[]
): PortalChannelMessage[] {
  const byId = new Map<string, PortalChannelMessage>()
  for (const message of older) byId.set(message.id, message)
  for (const message of latest) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

function sameAuthor(a: PortalChannelMessage, b: PortalChannelMessage): boolean {
  return a.mine === b.mine && a.from_team === b.from_team && a.author_name === b.author_name
}

export function buildPortalThread(messages: readonly PortalChannelMessage[], today: DateKey): PortalThreadDay[] {
  const days: PortalThreadDay[] = []
  let previous: PortalChannelMessage | null = null
  for (const message of messages) {
    const day = toDateKey(message.created_at)
    let current = days[days.length - 1]
    if (!current || current.day !== day) {
      current = { day, label: threadDayLabel(day, today), items: [] }
      days.push(current)
      previous = null
    }
    const continued =
      previous !== null &&
      sameAuthor(previous, message) &&
      previous.kind === "text" &&
      message.kind === "text" &&
      !message.post &&
      !message.project &&
      Date.parse(message.created_at) - Date.parse(previous.created_at) < GROUP_GAP_MS
    current.items.push({ key: message.id, at: message.created_at, message, continued })
    previous = message
  }
  return days
}

/** Hora da mensagem mais nova do fio: até onde a conta leu quando ele está na tela. */
export function newestMessageAt(messages: readonly PortalChannelMessage[]): Timestamp | null {
  return messages.at(-1)?.created_at ?? null
}
