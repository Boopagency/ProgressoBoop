import { PortalPostView } from "@/features/portal/post-view"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, postMessages, posts, PROFILE } from "../exemplos"

/** O post aberto do portal, esperando a aprovação, com dados de exemplo. */
export default function VitrinePostPage() {
  const today = todayKey()
  const post = posts(today).find((item) => item.id === "po1")!
  return (
    <VitrineShell area="portal" active="/portal">
      <PortalPostView
        post={post}
        clientName={CLIENT.name}
        showClient={false}
        handle={PROFILE.handle}
        avatar={<ProfilePhoto clientId={CLIENT.id} name={CLIENT.name} path={PROFILE.avatar} size="sm" />}
        messages={postMessages(today)}
        readings={[]}
        today={today}
        live={false}
      />
    </VitrineShell>
  )
}
