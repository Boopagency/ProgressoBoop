import { PortalPostView } from "@/features/portal/post-view"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, postMessages, posts, PROFILE, readings } from "../exemplos"

/** O post aberto do portal, publicado, com os números do Instagram, com dados de exemplo. */
export default function VitrinePublishedPostPage() {
  const today = todayKey()
  const post = posts(today).find((item) => item.id === "pp1")!
  return (
    <VitrineShell area="portal" active="/portal">
      <PortalPostView
        post={post}
        clientName={CLIENT.name}
        showClient={false}
        handle={PROFILE.handle}
        avatar={<ProfilePhoto clientId={CLIENT.id} name={CLIENT.name} path={PROFILE.avatar} size="sm" />}
        messages={postMessages(today).slice(0, 2)}
        readings={readings(today)}
        today={today}
        live={false}
      />
    </VitrineShell>
  )
}
