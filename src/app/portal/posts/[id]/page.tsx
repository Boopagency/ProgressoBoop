import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getPortalPostReadings } from "@/features/instagram/metrics-queries"
import type { PortalPost } from "@/features/portal/content-logic"
import { getPortalPostMessages, getPortalPosts, getPortalProfile } from "@/features/portal/content-queries"
import { PortalPostView } from "@/features/portal/post-view"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { pickPortalClient, requirePortalUser, requireUnlockedClient, type PortalClient } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Post" }

/**
 * Post aberto no portal: as imagens, a legenda, a resposta do cliente, os
 * números do Instagram (publicado) e o chat com a equipe.
 */
export default async function PortalPostPage(props: PageProps<"/portal/posts/[id]">) {
  const [user, params, searchParams] = await Promise.all([requirePortalUser(), props.params, props.searchParams])
  if (!isUuid(params.id)) notFound()

  // O post costuma ser do cliente escolhido; se não for, procura nos outros da conta.
  const picked = pickPortalClient(user, searchParams.cliente)
  const ordered = [picked, ...user.clients.filter((item) => item.id !== picked.id)]
  let found: { client: PortalClient; post: PortalPost } | null = null
  for (const candidate of ordered) {
    const post = (await getPortalPosts(candidate.id)).find((item) => item.id === params.id)
    if (post) {
      found = { client: candidate, post }
      break
    }
  }
  if (!found) notFound()
  const { client, post } = found
  // Achado em outro cliente da conta: vale o briefing pendente desse cliente.
  requireUnlockedClient(user, client)

  const [messages, profile, readings] = await Promise.all([
    getPortalPostMessages(post.id),
    // Sem o perfil, o post abre do mesmo jeito (o cabeçalho mostra o nome do cliente).
    getPortalProfile(client.id).catch(() => null),
    // Os números do Instagram, só no publicado (sem eles, o post abre do mesmo jeito).
    post.stage === "published" ? getPortalPostReadings(post.id).catch(() => []) : Promise.resolve([]),
  ])
  return (
    <PortalPostView
      post={post}
      clientName={client.name}
      showClient={user.clients.length > 1}
      handle={profile?.instagram_handle ?? null}
      avatar={<ProfilePhoto clientId={client.id} name={client.name} path={profile?.avatar_path ?? null} size="sm" />}
      messages={messages}
      readings={readings}
      today={todayKey()}
    />
  )
}
