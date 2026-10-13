import "server-only"

import { cache } from "react"

import { PORTAL_NOTIFICATIONS_LIMIT, type PortalNotification } from "@/features/portal/notification-logic"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Avisos da conta do cliente, lidos direto da tabela com a sessão dela: o RLS
 * de `client_notifications` só devolve os próprios avisos, dos clientes a que
 * ela ainda tem acesso.
 */

const COLUMNS = "id, kind, client_id, actor_name, title, body, link, read_at, created_at"

export async function fetchPortalNotifications(supabase: SupabaseServerClient): Promise<PortalNotification[]> {
  const { data, error } = await supabase
    .from("client_notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PORTAL_NOTIFICATIONS_LIMIT)
  if (error) throw loadError(error, "as notificações")
  return data
}

/** Quantos avisos da conta ainda não foram lidos. */
export async function fetchPortalUnreadCount(supabase: SupabaseServerClient): Promise<number> {
  const { count, error } = await supabase
    .from("client_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
  if (error) throw loadError(error, "as notificações")
  return count ?? 0
}

/** Os avisos e a hora da carga (para "há 5 min" sair igual no servidor e no navegador). */
export const getPortalNotifications = cache(async (): Promise<{ items: PortalNotification[]; loadedAt: number }> => {
  await requirePortalUser()
  const supabase = await createClient()
  const items = await fetchPortalNotifications(supabase)
  return { items, loadedAt: Date.now() }
})
