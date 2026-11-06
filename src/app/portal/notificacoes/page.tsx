import type { Metadata } from "next"

import { getPortalNotifications } from "@/features/portal/notification-queries"
import { PortalNotificationsView } from "@/features/portal/notifications-view"
import { requirePortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Notificações" }

/** Notificações: os avisos da conta (de todos os clientes que ela acompanha), lidos e não lidos. */
export default async function PortalNotificationsPage() {
  const [user, { items, loadedAt }] = await Promise.all([requirePortalUser(), getPortalNotifications()])
  return <PortalNotificationsView items={items} clients={user.clients} loadedAt={loadedAt} />
}
