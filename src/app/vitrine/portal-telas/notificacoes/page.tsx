import { PortalAlertsPreview } from "@/features/portal/portal-alerts"
import { PortalNotificationsView } from "@/features/portal/notifications-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, notifications } from "../exemplos"

/** As Notificações do portal, com avisos lidos e não lidos. */
export default function VitrineNotificationsPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/notificacoes">
      <PortalAlertsPreview counts={{ messages: 2, notifications: 3 }}>
        <PortalNotificationsView items={notifications(today)} clients={[CLIENT]} loadedAt={Date.parse(`${today}T12:30:00-03:00`)} />
      </PortalAlertsPreview>
    </VitrineShell>
  )
}
