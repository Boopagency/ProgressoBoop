import { PageBody, PageContainer } from "@/components/layout/page"
import type { PortalNotification } from "@/features/portal/notification-logic"
import { PortalNotificationList } from "@/features/portal/notification-list"
import { PortalHeader } from "@/features/portal/portal-ui"
import type { PortalClient } from "@/features/portal/session"

/** Notificações: os avisos da conta (de todos os clientes que ela acompanha), lidos e não lidos. */
export function PortalNotificationsView({
  items,
  clients,
  loadedAt,
}: {
  items: PortalNotification[]
  clients: readonly PortalClient[]
  loadedAt: number
}) {
  return (
    <PageContainer>
      <PortalHeader
        title={
          <>
            Seus <em>avisos</em>
          </>
        }
        description="Respostas da equipe, aprovações, etapas concluídas, documentos novos e pagamentos."
      />
      <PageBody width="reading" className="max-w-[820px]">
        <PortalNotificationList initial={items} clients={clients} now={loadedAt} />
      </PageBody>
    </PageContainer>
  )
}
