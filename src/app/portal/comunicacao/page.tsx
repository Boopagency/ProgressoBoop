import type { Metadata } from "next"
import Link from "next/link"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import {
  fetchPortalDirectThread,
  fetchPortalThread,
  getPortalChannel,
  getPortalDirectChannels,
  type PortalDirectConversation,
} from "@/features/portal/channel-queries"
import { portalHref } from "@/features/portal/links"
import { PortalChannel } from "@/features/portal/portal-channel"
import { pickPortalClient, requirePortalUser, type PortalClient } from "@/features/portal/session"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Comunicação" }

/**
 * Comunicação: a conversa do cliente com a equipe, no canal "Alterações" do
 * cliente, e as conversas diretas que alguém da equipe abriu com a pessoa
 * (`?conversa=`). No canal aparecem as mensagens gerais e as dos posts e
 * projetos que o cliente vê; as internas da equipe nunca saem do banco.
 */
export default async function PortalCommunicationPage(props: PageProps<"/portal/comunicacao">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const supabase = await createClient()
  const [channel, directs] = await Promise.all([getPortalChannel(client.id), getPortalDirectChannels(client.id)])
  const direct = directs.find((item) => item.channel_id === searchParams.conversa) ?? null
  const thread = direct
    ? await fetchPortalDirectThread(supabase, direct.channel_id)
    : await fetchPortalThread(supabase, client.id)

  return (
    <PageContainer>
      <PageHeader
        title="Comunicação"
        description={direct ? `${client.name} · conversa com ${direct.team_name}` : `${client.name} · conversa com a equipe da Boop`}
      />
      <PageBody width="reading">
        {directs.length > 0 ? (
          <ConversationTabs
            client={client}
            clients={user.clients}
            directs={directs}
            selected={direct?.channel_id ?? null}
            teamUnread={channel?.unread ?? 0}
          />
        ) : null}
        {direct ? (
          <PortalChannel
            key={direct.channel_id}
            client={client}
            clients={user.clients}
            initialMessages={thread.messages}
            initialHasMore={thread.hasMore}
            archived={direct.archived}
            direct={{ channelId: direct.channel_id, teamName: direct.team_name }}
          />
        ) : channel ? (
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

/** As conversas da pessoa: a da equipe toda e as diretas, com as não lidas. */
function ConversationTabs({
  client,
  clients,
  directs,
  selected,
  teamUnread,
}: {
  client: PortalClient
  clients: readonly PortalClient[]
  directs: PortalDirectConversation[]
  selected: string | null
  teamUnread: number
}) {
  const items = [
    { key: "team", label: "Equipe da Boop", href: portalHref("/portal/comunicacao", client, clients), unread: teamUnread, active: selected === null, avatar: null },
    ...directs.map((item) => ({
      key: item.channel_id,
      label: item.team_name,
      href: portalHref("/portal/comunicacao", client, clients, `conversa=${item.channel_id}`),
      unread: item.unread,
      active: selected === item.channel_id,
      avatar: item.team_avatar_url,
    })),
  ]
  return (
    <nav aria-label="Conversas" className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            item.active ? "border-brand bg-accent font-medium text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            item.unread > 0 && !item.active && "font-semibold text-foreground"
          )}
        >
          {item.key === "team" ? null : (
            <PersonAvatar
              name={item.label}
              avatarUrl={item.avatar}
              colorIndex={1}
              size="sm"
              className="size-5 [&_[data-slot=avatar-fallback]]:text-[10px]"
            />
          )}
          <span>{item.label}</span>
          {item.unread > 0 ? (
            <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[11px] font-semibold text-brand-navy tabular-nums">
              {item.unread > 99 ? "99+" : item.unread}
              <span className="sr-only"> não {item.unread === 1 ? "lida" : "lidas"}</span>
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
