import { PortalCommunicationView } from "@/features/portal/communication-view"
import { PortalAlertsPreview } from "@/features/portal/portal-alerts"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, DIRECTS, thread } from "../exemplos"

/** A Comunicação do portal: a conversa com a equipe aberta (no celular, em tela cheia). */
export default function VitrineConversationPage() {
  const today = todayKey()
  const messages = thread(today)
  return (
    <VitrineShell area="portal" active="/portal/comunicacao">
      <PortalAlertsPreview counts={{ messages: 2, notifications: 3 }}>
        <PortalCommunicationView
          client={CLIENT}
          clients={[CLIENT]}
          channel={{ archived: false, unread: 2 }}
          directs={DIRECTS}
          direct={null}
          opened
          thread={{ messages, hasMore: true }}
          previews={null}
          live={false}
        />
      </PortalAlertsPreview>
    </VitrineShell>
  )
}
