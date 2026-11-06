import { InstagramCard } from "@/features/instagram/instagram-card"
import { PortalFeedView } from "@/features/portal/feed-view"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, FEED_VIEWS, instagram, posts, PROFILE } from "../exemplos"

/** O Feed do portal de verdade, com dados de exemplo. */
export default function VitrineFeedPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/feed">
      <PortalFeedView
        clientName={CLIENT.name}
        handle={PROFILE.handle}
        bio={PROFILE.bio}
        photo={<ProfilePhoto clientId={CLIENT.id} name={CLIENT.name} path={PROFILE.avatar} />}
        instagram={
          <InstagramCard clientId={CLIENT.id} clientName={CLIENT.name} data={instagram(today)} notice={null} audience="client" today={today} />
        }
        posts={posts(today)}
        views={FEED_VIEWS}
        today={today}
        postHref={() => "/vitrine/portal-telas/post"}
      />
    </VitrineShell>
  )
}
