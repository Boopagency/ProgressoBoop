"use server"

import { requireUser } from "@/features/auth/session"
import type { NotificationFeed } from "@/features/notifications/logic"
import { markRead } from "@/features/notifications/mutations"
import { fetchNotifications } from "@/features/notifications/queries"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/*
 * Server Actions do sino. A lista vem sempre daqui, com a sessão da pessoa e
 * o RLS; o Realtime no navegador só avisa que algo mudou (realtime.ts).
 * Marcar como lida não recarrega o app: só o sino mostra os avisos. A hora da
 * leitura é a do banco (trigger set_notification_fields).
 */

export async function loadNotifications(): Promise<ActionResult<NotificationFeed>> {
  const user = await requireUser()
  try {
    const supabase = await createClient()
    return { ok: true, data: await fetchNotifications(supabase, user.id) }
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Não foi possível carregar as notificações." }
  }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser()
  return markRead(await createClient(), user.id, id)
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser()
  return markRead(await createClient(), user.id, null)
}

/**
 * Token da sessão para o navegador escutar o Realtime: o mesmo que já está no
 * cookie da sessão (renovado pelo proxy a cada requisição). O navegador não
 * guarda sessão nem renova token; pede outro aqui quando este está perto de
 * vencer.
 */
export async function getRealtimeToken(): Promise<ActionResult<string>> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return { ok: false, error: "Sessão expirada." }
  return { ok: true, data: data.session.access_token }
}
