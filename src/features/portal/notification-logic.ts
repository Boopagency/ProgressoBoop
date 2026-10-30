import { mentionPlainText } from "@/features/mentions/logic"
import type { Timestamp } from "@/lib/types"

/*
 * Avisos do cliente no portal (`client_notifications`): a frase de cada um e
 * o contador. Funções puras. O banco grava os avisos (respostas da equipe,
 * post e etapa para aprovar, etapa concluída, documento novo); o portal só
 * lê e marca como lidos.
 */

/** Avisos mostrados na tela de Notificações (os mais recentes). */
export const PORTAL_NOTIFICATIONS_LIMIT = 50
/** O menu confere as contagens a cada tanto (o Realtime avisa antes, quando está no ar). */
export const PORTAL_COUNTS_POLL_MS = 30000

export type PortalNotificationKind =
  | "team_message"
  | "post_review"
  | "step_approval"
  | "step_done"
  | "file_shared"
  | "payment_overdue"

/** Aviso da conta do cliente. O texto é uma cópia do momento em que nasceu. */
export interface PortalNotification {
  id: string
  kind: PortalNotificationKind
  client_id: string
  /** Quem da equipe fez (vazio quando foi o banco). */
  actor_name: string | null
  /** O post, a etapa ou o projeto da mensagem (vazio na conversa geral). */
  title: string | null
  /** Trecho da mensagem ou o projeto da etapa. */
  body: string | null
  /** Caminho dentro do portal. */
  link: string
  read_at: Timestamp | null
  created_at: Timestamp
}

/** Contagens do menu: mensagens não lidas do cliente escolhido e avisos não lidos da conta. */
export interface PortalCounts {
  messages: number
  notifications: number
}

export const NO_PORTAL_COUNTS: PortalCounts = { messages: 0, notifications: 0 }

/** A frase do aviso em partes, para o assunto sair em destaque. */
export interface PortalNotificationText {
  lead: string
  subject: string | null
  /** Trecho mostrado abaixo (a mensagem ou o projeto da etapa). */
  excerpt: string | null
}

export function describePortalNotification(notification: PortalNotification): PortalNotificationText {
  // As menções da mensagem ("@[Título](post:…)") aparecem como "@Título".
  const item = { ...notification, body: notification.body && mentionPlainText(notification.body) }
  const actor = item.actor_name?.trim() || "A equipe da Boop"
  switch (item.kind) {
    case "team_message":
      return item.title
        ? { lead: `${actor} respondeu em`, subject: item.title, excerpt: item.body }
        : { lead: `${actor} mandou uma mensagem`, subject: null, excerpt: item.body }
    case "post_review":
      return { lead: "Post para você aprovar:", subject: item.title, excerpt: null }
    case "step_approval":
      return { lead: "Etapa para você aprovar:", subject: item.title, excerpt: item.body ? `Projeto ${item.body}` : null }
    case "step_done":
      return { lead: "Etapa concluída:", subject: item.title, excerpt: item.body ? `Projeto ${item.body}` : null }
    case "file_shared":
      return { lead: "Novo documento:", subject: item.title, excerpt: null }
    case "payment_overdue":
      // Título: a cobrança; trecho: "R$ 3.500,00 · venceu em 25/10".
      return {
        lead: "Consta um pagamento em aberto:",
        subject: item.title,
        excerpt: item.body ? `${item.body}. Se já pagou, desconsidere ou avise a gente pela Comunicação.` : null,
      }
  }
}

/** Contador do menu: até 99, depois "99+". */
export function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count)
}
