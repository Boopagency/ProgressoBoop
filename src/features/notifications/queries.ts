import "server-only"

import { requireUser } from "@/features/auth/session"
import { EMPTY_FEED, NOTIFICATIONS_LIMIT, type NotificationFeed } from "@/features/notifications/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"

export const NOTIFICATION_COLUMNS = "id, kind, actor_name, client_id, title, body, item_count, link, read_at, created_at"

/** Os avisos mais recentes da pessoa e quantos ainda não foram lidos (RLS: só os dela). */
export async function fetchNotifications(supabase: SupabaseServerClient, userId: string): Promise<NotificationFeed> {
  const [list, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATIONS_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ])
  if (list.error) throw loadError(list.error, "as notificações")
  if (unread.error) throw loadError(unread.error, "as notificações")
  return { items: list.data, unread: unread.count ?? 0 }
}

/**
 * Avisos para o sino do topo. Se falhar, a área logada abre do mesmo jeito,
 * com o sino vazio (ele pergunta de novo em seguida).
 */
export async function getNotifications(): Promise<NotificationFeed> {
  const user = await requireUser()
  const supabase = await createClient()
  try {
    return await fetchNotifications(supabase, user.id)
  } catch {
    return EMPTY_FEED
  }
}
