"use server"

import { fetchPortalUnreadMessages } from "@/features/portal/channel-queries"
import type { PortalCounts, PortalNotification } from "@/features/portal/notification-logic"
import { fetchPortalNotifications, fetchPortalUnreadCount } from "@/features/portal/notification-queries"
import { getPortalUser } from "@/features/portal/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Avisos e contagens do portal. A lista vem sempre daqui, com a sessão da
 * conta e o RLS; o Realtime no navegador só avisa que algo mudou. Marcar como
 * lido muda só `read_at` (com a hora do banco, trigger
 * set_client_notification_fields).
 */

const SIGNED_OUT = "Sua sessão terminou. Entre de novo."

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Contagens do menu: não lidas das conversas do cliente escolhido e avisos não lidos da conta. */
export async function loadPortalCounts(clientId: string): Promise<ActionResult<PortalCounts>> {
  const user = await getPortalUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const client = user.clients.find((item) => item.id === clientId) ?? user.clients[0]
  if (!client || !isUuid(client.id)) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  try {
    const [messages, notifications] = await Promise.all([
      fetchPortalUnreadMessages(supabase, client.id),
      fetchPortalUnreadCount(supabase),
    ])
    return { ok: true, data: { messages, notifications } }
  } catch (error) {
    return { ok: false, error: message(error, "Não foi possível carregar as contagens.") }
  }
}

export async function loadPortalNotifications(): Promise<ActionResult<PortalNotification[]>> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  try {
    return { ok: true, data: await fetchPortalNotifications(supabase) }
  } catch (error) {
    return { ok: false, error: message(error, "Não foi possível carregar as notificações.") }
  }
}

export async function markPortalNotificationRead(id: string): Promise<ActionResult> {
  const user = await getPortalUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(id)) return { ok: false, error: "Essa notificação não existe mais." }
  const supabase = await createClient()
  const { error } = await supabase
    .from("client_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null)
  if (error) return dbFailure(error, "Não foi possível marcar como lida.")
  return { ok: true, data: null }
}

export async function markAllPortalNotificationsRead(): Promise<ActionResult> {
  const user = await getPortalUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { error } = await supabase
    .from("client_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
  if (error) return dbFailure(error, "Não foi possível marcar as notificações como lidas.")
  return { ok: true, data: null }
}

/**
 * Token da sessão para o navegador escutar os próprios avisos pelo Realtime,
 * como o sino da equipe (`getRealtimeToken`), mas para a conta do cliente.
 */
export async function getPortalRealtimeToken(): Promise<ActionResult<string>> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return { ok: false, error: "Sessão expirada." }
  return { ok: true, data: data.session.access_token }
}
