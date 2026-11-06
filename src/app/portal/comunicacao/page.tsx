import type { Metadata } from "next"

import {
  fetchPortalDirectThread,
  fetchPortalThread,
  getPortalChannel,
  getPortalConversationPreviews,
  getPortalDirectChannels,
} from "@/features/portal/channel-queries"
import { PortalCommunicationView, TEAM_CONVERSATION } from "@/features/portal/communication-view"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Comunicação" }

/**
 * Comunicação: a conversa do cliente com a equipe, no canal "Alterações" do
 * cliente, e as conversas diretas que alguém da equipe abriu com a pessoa
 * (`?conversa=`). No canal aparecem as mensagens gerais e as dos posts e
 * projetos que o cliente vê; as internas da equipe nunca saem do banco. No
 * celular, como nos aplicativos de conversa: a lista das conversas e, ao
 * tocar (`?conversa=equipe` ou o id), a conversa em tela cheia.
 */
export default async function PortalCommunicationPage(props: PageProps<"/portal/comunicacao">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const supabase = await createClient()
  const [channel, directs] = await Promise.all([getPortalChannel(client.id), getPortalDirectChannels(client.id)])
  const direct = directs.find((item) => item.channel_id === searchParams.conversa) ?? null
  // No celular: uma conversa aberta (tela cheia) ou a lista.
  const opened = direct !== null || searchParams.conversa === TEAM_CONVERSATION
  const [thread, previews] = await Promise.all([
    direct ? fetchPortalDirectThread(supabase, direct.channel_id) : fetchPortalThread(supabase, client.id),
    opened ? null : getPortalConversationPreviews(client.id, directs.map((item) => item.channel_id)),
  ])

  return (
    <PortalCommunicationView
      client={client}
      clients={user.clients}
      channel={channel}
      directs={directs}
      direct={direct}
      opened={opened}
      thread={thread}
      previews={previews}
    />
  )
}
