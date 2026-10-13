import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { PortalNotificationList } from "@/features/portal/notification-list"
import { getPortalNotifications } from "@/features/portal/notification-queries"
import { requirePortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Notificações" }

/** Notificações: os avisos da conta (de todos os clientes que ela acompanha), lidos e não lidos. */
export default async function PortalNotificationsPage() {
  const [user, { items, loadedAt }] = await Promise.all([requirePortalUser(), getPortalNotifications()])

  return (
    <PageContainer>
      <PageHeader title="Notificações" description="Respostas da equipe, aprovações e etapas concluídas" />
      <PageBody width="reading">
        <PortalNotificationList initial={items} clients={user.clients} now={loadedAt} />
      </PageBody>
    </PageContainer>
  )
}
