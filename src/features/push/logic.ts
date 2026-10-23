import { mentionPlainText } from "@/features/mentions/logic"
import { describeNotification, type NotificationKind } from "@/features/notifications/logic"
import { describePortalNotification, type PortalNotificationKind } from "@/features/portal/notification-logic"

/*
 * Notificações no celular (Web Push): o que o banco manda para /api/push, a
 * frase de cada push e a validação da inscrição do aparelho. Funções puras.
 * O banco decide quem recebe (as mesmas linhas do sino, em `notifications` e
 * `client_notifications`); o app só monta o texto e assina o envio.
 */

/** Limites da tabela `push_subscriptions`. */
export const ENDPOINT_MAX = 1000
export const P256DH_MAX = 200
export const AUTH_MAX = 100
export const DEVICE_MAX = 120

/** Renova a inscrição do aparelho no banco no máximo uma vez por dia. */
export const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000

/** Título e texto do push são curtos na tela bloqueada. */
const TITLE_MAX = 120
const BODY_MAX = 240

export interface PushKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/** A inscrição que o navegador entrega (PushSubscription.toJSON()), já conferida. */
export interface PushSubscriptionInput extends PushKeys {
  device: string | null
}

/** O aviso como o banco manda (uma cópia da linha, mais as inscrições de quem recebe). */
export interface PushNotificationRow {
  id: string
  kind: string
  actor_name: string | null
  client_id: string | null
  client_name: string | null
  title: string | null
  body: string | null
  item_count?: number | null
  link: string
  created_at: string
  /** Avisos não lidos de quem recebe, contando este (o número no ícone do app). */
  unread?: number | null
  subscriptions: PushKeys[]
}

export type PushAudience = "team" | "client"

export interface PushWebhookBody {
  audience: PushAudience
  notifications: PushNotificationRow[]
}

/** O que o service worker recebe e mostra (public/sw.js). */
export interface PushMessage {
  title: string
  body: string
  /** Caminho dentro do app, aberto ao tocar. */
  link: string
  /** O id do aviso: o mesmo aviso do sino e do push aparece uma vez só. */
  tag: string
  /** Número no ícone do app (não lidas); ausente quando o banco não mandou. */
  badge?: number
}

const TEAM_KINDS = new Set<string>([
  "message",
  "client_message",
  "client_approval",
  "client_change_request",
  "task_assigned",
  "client_referral",
  "site_lead",
] satisfies NotificationKind[])

const CLIENT_KINDS = new Set<string>([
  "team_message",
  "post_review",
  "step_approval",
  "step_done",
  "file_shared",
] satisfies PortalNotificationKind[])

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Só caminhos do próprio app (o banco já garante; aqui é a segunda trava). */
export function safeLink(link: unknown, audience: PushAudience): string {
  const fallback = audience === "client" ? "/portal/notificacoes" : "/hoje"
  if (typeof link !== "string" || !/^\/[^/\\]/.test(link)) return fallback
  if (audience === "client" && !/^\/portal(\/|\?|$)/.test(link)) return fallback
  return link
}

/**
 * A frase do push, a mesma do sino: na equipe, "Danielle (Velmont) aprovou"
 * com o post no texto; no portal, "Post para você aprovar:" com o post.
 * Aviso de um tipo novo, que o app ainda não conhece, sai com o título e o
 * trecho como vieram.
 */
export function pushMessage(audience: PushAudience, row: PushNotificationRow): PushMessage {
  const link = safeLink(row.link, audience)
  let title: string
  let body: string

  if (audience === "team" && TEAM_KINDS.has(row.kind)) {
    const text = describeNotification(
      {
        id: row.id,
        kind: row.kind as NotificationKind,
        actor_name: row.actor_name,
        client_id: row.client_id,
        title: row.title,
        body: row.body,
        item_count: row.item_count ?? 1,
        link,
        read_at: null,
        created_at: row.created_at,
      },
      row.client_name
    )
    title = `${text.actor} ${text.action}`
    body = [text.subject, text.excerpt].filter(Boolean).join(": ")
  } else if (audience === "client" && CLIENT_KINDS.has(row.kind)) {
    const text = describePortalNotification({
      id: row.id,
      kind: row.kind as PortalNotificationKind,
      client_id: row.client_id ?? "",
      actor_name: row.actor_name,
      title: row.title,
      body: row.body,
      link,
      read_at: null,
      created_at: row.created_at,
    })
    title = text.lead.replace(/:$/, "")
    body = [text.subject, text.excerpt].filter(Boolean).join(": ")
  } else {
    title = row.title?.trim() || (audience === "client" ? "Boop" : "Boop Admin")
    body = mentionPlainText(row.body ?? "")
  }

  return {
    title: clip(title, TITLE_MAX),
    body: clip(body || "Toque para ver.", BODY_MAX),
    link,
    tag: row.id,
    ...(typeof row.unread === "number" && row.unread >= 0 ? { badge: Math.floor(row.unread) } : {}),
  }
}

/** Confere a inscrição que veio do navegador. */
export function parseSubscription(input: unknown): PushSubscriptionInput | null {
  if (!input || typeof input !== "object") return null
  const { endpoint, keys, device } = input as { endpoint?: unknown; keys?: unknown; device?: unknown }
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > ENDPOINT_MAX) return null
  if (!keys || typeof keys !== "object") return null
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== "string" || !p256dh || p256dh.length > P256DH_MAX) return null
  if (typeof auth !== "string" || !auth || auth.length > AUTH_MAX) return null
  return {
    endpoint,
    p256dh,
    auth,
    device: typeof device === "string" && device.trim() ? device.trim().slice(0, DEVICE_MAX) : null,
  }
}

/** Nome curto do aparelho, para a pessoa reconhecer (ex.: "iPhone", "Android"). */
export function deviceLabel(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return "iPhone"
  if (/iPad/.test(userAgent)) return "iPad"
  if (/Android/.test(userAgent)) return "Android"
  if (/Macintosh/.test(userAgent)) return "Mac"
  if (/Windows/.test(userAgent)) return "Windows"
  return "Navegador"
}

/** A chave pública VAPID (base64url) no formato que o PushManager pede. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
