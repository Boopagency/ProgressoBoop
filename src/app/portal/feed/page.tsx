import type { Metadata } from "next"

import { InstagramCard } from "@/features/instagram/instagram-card"
import { connectNotice } from "@/features/instagram/logic"
import { getPortalFeedViews } from "@/features/instagram/metrics-queries"
import { getPortalInstagram } from "@/features/instagram/queries"
import { portalFeed } from "@/features/portal/content-logic"
import { getPortalPosts, getPortalProfile } from "@/features/portal/content-queries"
import { PortalFeedView } from "@/features/portal/feed-view"
import { portalHref } from "@/features/portal/links"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Feed" }

/**
 * Prévia do Instagram do cliente: o perfil e o grid com os posts que já
 * chegaram a ele. Nos publicados, as visualizações ao passar o mouse (no
 * celular, no post aberto).
 */
export default async function PortalFeedPage(props: PageProps<"/portal/feed">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const [posts, profile, instagram] = await Promise.all([
    getPortalPosts(client.id),
    getPortalProfile(client.id),
    getPortalInstagram(client.id),
  ])
  const today = todayKey()
  const tiles = portalFeed(posts)
  // Visualizações da última leitura dos publicados (sem elas, o feed abre do mesmo jeito).
  const views = await getPortalFeedViews(tiles.filter((post) => post.stage === "published").map((post) => post.id)).catch(
    () => ({}) as Record<string, number>
  )

  return (
    <PortalFeedView
      clientName={client.name}
      handle={profile?.instagram_handle ?? null}
      bio={profile?.instagram_bio ?? null}
      photo={<ProfilePhoto clientId={client.id} name={client.name} path={profile?.avatar_path ?? null} />}
      instagram={
        <InstagramCard
          clientId={client.id}
          clientName={client.name}
          data={instagram}
          notice={connectNotice(searchParams.instagram)}
          audience="client"
          today={today}
        />
      }
      posts={posts}
      views={views}
      today={today}
      postHref={(id) => portalHref(`/portal/posts/${id}`, client, user.clients)}
    />
  )
}
