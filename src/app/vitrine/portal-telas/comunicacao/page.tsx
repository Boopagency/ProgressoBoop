import { PortalCommunicationView } from "@/features/portal/communication-view"
import { PortalAlertsPreview } from "@/features/portal/portal-alerts"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, DIRECTS, thread } from "../exemplos"

/** A Comunicação do portal: no celular, a lista das conversas; no computador, a conversa com a equipe. */
export default function VitrineCommunicationPage() {
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
          opened={false}
          thread={{ messages, hasMore: true }}
          previews={{ team: messages.at(-1)!, "dm-leo": { ...messages[3]!, id: "d1", body: "Te mandei o áudio com a ideia do vídeo 🎬", audio: null } }}
          live={false}
        />
      </PortalAlertsPreview>
    </VitrineShell>
  )
}
