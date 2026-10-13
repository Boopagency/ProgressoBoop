import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { fetchPortalThread, getPortalChannel } from "@/features/portal/channel-queries"
import { PortalChannel } from "@/features/portal/portal-channel"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Comunicação" }

/**
 * Comunicação: a conversa do cliente com a equipe, no canal "Alterações" do
 * cliente. Aparecem as mensagens gerais e as dos posts e projetos que o
 * cliente vê; as internas da equipe nunca saem do banco.
 */
export default async function PortalCommunicationPage(props: PageProps<"/portal/comunicacao">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const supabase = await createClient()
  const [channel, thread] = await Promise.all([getPortalChannel(client.id), fetchPortalThread(supabase, client.id)])

  return (
    <PageContainer>
      <PageHeader title="Comunicação" description={`${client.name} · conversa com a equipe da Boop`} />
      <PageBody width="reading">
        {channel ? (
          <PortalChannel
            key={client.id}
            client={client}
            clients={user.clients}
            initialMessages={thread.messages}
            initialHasMore={thread.hasMore}
            archived={channel.archived}
          />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
            A conversa com a equipe ainda não está disponível. Avise a Boop.
          </p>
        )}
      </PageBody>
    </PageContainer>
  )
}
