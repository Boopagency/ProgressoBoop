import type { Timestamp } from "@/lib/types"

/*
 * Regras da central de notificações: a frase de cada aviso e o que é novo
 * desde a última consulta. Funções puras; o que depende do navegador (som,
 * aviso do sistema, preferências) fica em `browser.ts`.
 */

/** Com o Realtime no ar, o sino ainda confere a lista a cada minuto. */
export const REALTIME_CHECK_MS = 60000
/** Sem o Realtime (conexão caiu, sem configuração), pergunta a cada 10 segundos. */
export const FALLBACK_POLL_MS = 10000
/** Pede um token novo para o Realtime quando faltam 2 minutos para vencer. */
export const TOKEN_MARGIN_MS = 2 * 60 * 1000
/** Avisos mostrados na lista (os mais recentes). */
export const NOTIFICATIONS_LIMIT = 30

export type NotificationKind =
  | "message"
  | "client_message"
  | "client_approval"
  | "client_change_request"
  | "task_assigned"

/** Aviso da pessoa logada. O texto é uma cópia do momento em que nasceu. */
export interface AppNotification {
  id: string
  kind: NotificationKind
  actor_name: string | null
  /** O cliente, nos avisos do portal. */
  client_id: string | null
  /** Canal, post, tarefa ou projeto (vazio na conversa direta). */
  title: string | null
  /** Trecho da mensagem. */
  body: string | null
  /** Tarefas atribuídas de uma vez. */
  item_count: number
  /** Caminho dentro do app. */
  link: string
  read_at: Timestamp | null
  created_at: Timestamp
}

export interface NotificationFeed {
  items: AppNotification[]
  unread: number
}

export const EMPTY_FEED: NotificationFeed = { items: [], unread: 0 }

/** A frase do aviso em partes, para o nome e o assunto saírem em destaque. */
export interface NotificationText {
  actor: string
  action: string
  subject: string | null
  /** Trecho mostrado abaixo (mensagem, pedido de ajuste). */
  excerpt: string | null
}

export function describeNotification(item: AppNotification, clientName?: string | null): NotificationText {
  const actor = item.actor_name?.trim() || "Alguém"
  const fromClient = clientName ? `${actor} (${clientName})` : actor
  switch (item.kind) {
    case "message":
      return item.title
        ? { actor, action: "em", subject: item.title, excerpt: item.body }
        : { actor, action: "mandou uma mensagem para você", subject: null, excerpt: item.body }
    case "client_message":
      return { actor: fromClient, action: "escreveu em", subject: item.title, excerpt: item.body }
    case "client_approval":
      return { actor: fromClient, action: "aprovou", subject: item.title, excerpt: null }
    case "client_change_request":
      return { actor: fromClient, action: "pediu ajuste em", subject: item.title, excerpt: item.body }
    case "task_assigned":
      return item.item_count > 1
        ? {
            actor,
            action: `atribuiu ${item.item_count} tarefas a você${item.title ? " em" : ""}`,
            subject: item.title,
            excerpt: null,
          }
        : { actor, action: "atribuiu a você", subject: item.title, excerpt: null }
  }
}

/** Frase inteira, em texto puro (aviso do navegador, leitores de tela). */
export function notificationSentence(text: NotificationText): string {
  return [text.actor, text.action, text.subject].filter(Boolean).join(" ")
}

/** Contador do sino: até 99, depois "99+". */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count)
}

/**
 * Avisos não lidos que ainda não estavam na tela, do mais antigo para o mais
 * novo. `known` são os ids já vistos nesta aba.
 */
export function freshNotifications(items: AppNotification[], known: ReadonlySet<string>): AppNotification[] {
  return items.filter((item) => !item.read_at && !known.has(item.id)).reverse()
}

/** Quando o JWT vence (ms desde 1970), pelo campo `exp`; null se não der para ler. */
export function jwtExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))
    const exp: unknown = JSON.parse(json).exp
    return typeof exp === "number" ? exp * 1000 : null
  } catch {
    return null
  }
}
