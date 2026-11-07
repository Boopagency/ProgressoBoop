import type { Metadata } from "next"

import { getPortalNotifications } from "@/features/portal/notification-queries"
import { PortalNotificationsView } from "@/features/portal/notifications-view"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Notificações" }

/**
 * Notificações: os avisos da conta (de todos os clientes que ela acompanha),
 * lidos e não lidos. Com o briefing do cliente escolhido pendente, vai para o
 * Briefing.
 */
export default async function PortalNotificationsPage(props: PageProps<"/portal/notificacoes">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  pickPortalClient(user, searchParams.cliente)
  const { items, loadedAt } = await getPortalNotifications()
  return <PortalNotificationsView items={items} clients={user.clients} loadedAt={loadedAt} />
}
