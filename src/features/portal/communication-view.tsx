import Link from "next/link"

import { BoopMark } from "@/components/layout/boop-mark"
import { PageBody, PageContainer } from "@/components/layout/page"
import { listTimeLabel } from "@/features/channels/logic"
import { mentionPlainText } from "@/features/mentions/logic"
import type { PortalChannelMessage, PortalDirectConversation } from "@/features/portal/channel-queries"
import { portalHref } from "@/features/portal/links"
import { PortalChannel } from "@/features/portal/portal-channel"
import { PortalHeader } from "@/features/portal/portal-ui"
import type { PortalClient } from "@/features/portal/session"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { todayKey } from "@/lib/dates"
import { cn } from "@/lib/utils"

/** `?conversa=equipe`: a conversa com a equipe aberta (no celular, em tela cheia; no computador, como sem nada). */
export const TEAM_CONVERSATION = "equipe"
const TEAM = TEAM_CONVERSATION

export interface PortalCommunicationData {
  client: PortalClient
  clients: readonly PortalClient[]
  /** O canal "Alterações" do cliente (null se ainda não existe). */
  channel: { archived: boolean; unread: number } | null
  directs: PortalDirectConversation[]
  /** A conversa direta aberta (`?conversa=<id>`). */
  direct: PortalDirectConversation | null
  /** No celular, uma conversa aberta em tela cheia (no lugar da lista). */
  opened: boolean
  thread: { messages: PortalChannelMessage[]; hasMore: boolean }
  /** Última mensagem de cada conversa, para a lista do celular (só com a lista na tela). */
  previews: Record<string, PortalChannelMessage> | null
  /** As conversas buscam mensagens novas e marcam como lidas (desligado na vitrine). */
  live?: boolean
}

/**
 * Comunicação: a conversa do cliente com a equipe, no canal "Alterações" do
 * cliente, e as conversas diretas que alguém da equipe abriu com a pessoa.
 * No celular, como nos aplicativos de conversa: a lista das conversas e, ao
 * tocar, a conversa em tela cheia, com mensagens de voz.
 */
export function PortalCommunicationView({
  client,
  clients,
  channel,
  directs,
  direct,
  opened,
  thread,
  previews,
  live = true,
}: PortalCommunicationData) {
  const listHref = portalHref("/portal/comunicacao", client, clients)
  return (
    <PageContainer>
      <PortalHeader
        client={client.name}
        title={
          <>
            Fale com a <em>equipe</em>
          </>
        }
        description={
          direct
            ? `Sua conversa com ${direct.team_name}, da equipe da Boop.`
            : "A conversa com a equipe da Boop: dúvidas, pedidos, materiais e mensagens de voz."
        }
        className="max-md:mb-2"
      />
      <PageBody width="reading">
        {directs.length > 0 ? (
          <ConversationTabs
            client={client}
            clients={clients}
            directs={directs}
            selected={direct?.channel_id ?? null}
            teamUnread={channel?.unread ?? 0}
          />
        ) : null}
        {previews ? (
          <ConversationList
            client={client}
            clients={clients}
            directs={directs}
            teamUnread={channel?.unread ?? 0}
            previews={previews}
            hasTeam={channel !== null}
          />
        ) : null}
        {direct ? (
          <PortalChannel
            key={direct.channel_id}
            client={client}
            clients={clients}
            initialMessages={thread.messages}
            initialHasMore={thread.hasMore}
            archived={direct.archived}
            direct={{ channelId: direct.channel_id, teamName: direct.team_name }}
            live={live}
            heading={{
              avatar: <TeamAvatar name={direct.team_name} avatarUrl={direct.team_avatar_url} className="size-10" />,
              title: direct.team_name,
              subtitle: `${client.name} · equipe da Boop`,
            }}
            mobile={{
              backHref: listHref,
              avatar: <TeamAvatar name={direct.team_name} avatarUrl={direct.team_avatar_url} className="size-9" />,
              title: direct.team_name,
              subtitle: `${client.name} · equipe da Boop`,
            }}
          />
        ) : channel ? (
          <PortalChannel
            key={client.id}
            client={client}
            clients={clients}
            initialMessages={thread.messages}
            initialHasMore={thread.hasMore}
            archived={channel.archived}
            hiddenOnMobile={!opened}
            live={live}
            heading={{ avatar: <BoopAvatar className="size-10" />, title: "Equipe da Boop", subtitle: client.name }}
            mobile={
              opened
                ? { backHref: listHref, avatar: <BoopAvatar className="size-9" />, title: "Equipe da Boop", subtitle: client.name }
                : null
            }
          />
        ) : (
          <p className={cn("rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground", !opened && "max-md:hidden")}>
            A conversa com a equipe ainda não está disponível. Avise a Boop.
          </p>
        )}
      </PageBody>
    </PageContainer>
  )
}

/** A foto da conversa com a equipe toda: a marca da Boop. */
function BoopAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-glow/25 bg-glow-soft", className)} aria-hidden="true">
      <BoopMark className="w-[62%]" />
    </span>
  )
}

/** A foto de quem da equipe conversa direto com a pessoa. */
function TeamAvatar({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className?: string }) {
  return <PersonAvatar name={name} avatarUrl={avatarUrl} colorIndex={1} className={cn("[&_[data-slot=avatar-fallback]]:text-sm", className)} />
}

/** A segunda linha da conversa na lista: quem escreveu (na conversa com a equipe toda) e a última mensagem. */
function previewText(message: PortalChannelMessage | undefined, group: boolean): string {
  if (!message) return "Nenhuma mensagem ainda"
  const text = mentionPlainText(message.body).replace(/\s+/g, " ")
  if (message.kind === "system") return text
  if (message.mine) return `Você: ${text}`
  return group ? `${message.author_name.split(" ")[0]}: ${text}` : text
}

/**
 * No celular, a Comunicação começa pela lista das conversas, como nos
 * aplicativos de conversa: a da equipe toda e as diretas, com a foto, o
 * nome, a última mensagem, a hora e as não lidas. Do `md` para cima, some (as
 * conversas ficam nas abas de cima).
 */
function ConversationList({
  client,
  clients,
  directs,
  teamUnread,
  previews,
  hasTeam,
}: {
  client: PortalClient
  clients: readonly PortalClient[]
  directs: PortalDirectConversation[]
  teamUnread: number
  previews: Record<string, PortalChannelMessage>
  hasTeam: boolean
}) {
  const today = todayKey()
  const items = [
    ...(hasTeam
      ? [
          {
            key: TEAM,
            name: "Equipe da Boop",
            avatar: <BoopAvatar className="size-12" />,
            preview: previews.team,
            unread: teamUnread,
          },
        ]
      : []),
    ...directs.map((item) => ({
      key: item.channel_id,
      name: item.team_name,
      avatar: <TeamAvatar name={item.team_name} avatarUrl={item.team_avatar_url} className="size-12" />,
      preview: previews[item.channel_id],
      unread: item.unread,
    })),
  ].sort((a, b) => (b.preview?.created_at ?? "").localeCompare(a.preview?.created_at ?? ""))

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground md:hidden">
        A conversa com a equipe ainda não está disponível. Avise a Boop.
      </p>
    )
  }
  return (
    <ul aria-label="Conversas" className="overflow-hidden rounded-[1.5rem] border bg-card md:hidden">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={portalHref("/portal/comunicacao", client, clients, `conversa=${item.key}`)}
            className="flex items-center gap-3 px-4 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-accent active:bg-accent"
          >
            {item.avatar}
            <span className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border/70 py-2 [li:last-child_&]:border-b-0">
              <span className="flex items-baseline gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-[15.5px] text-foreground", item.unread > 0 ? "font-semibold" : "font-medium")}>
                  {item.name}
                </span>
                {item.preview ? (
                  <time
                    dateTime={item.preview.created_at}
                    className={cn("shrink-0 text-xs tabular-nums", item.unread > 0 ? "font-medium text-brand-ink" : "text-muted-foreground")}
                  >
                    {listTimeLabel(item.preview.created_at, today)}
                  </time>
                ) : null}
              </span>
              <span className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{previewText(item.preview, item.key === TEAM)}</span>
                {item.unread > 0 ? (
                  <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums shadow-[0_0_10px_-2px_var(--glow)]">
                    {item.unread > 99 ? "99+" : item.unread}
                    <span className="sr-only"> não {item.unread === 1 ? "lida" : "lidas"}</span>
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
    <nav aria-label="Conversas" className="-mb-2 flex gap-2 overflow-x-auto pb-1 max-md:hidden">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            item.active
              ? "border-glow/50 bg-glow-soft font-medium text-foreground shadow-[0_0_18px_-6px_var(--glow)]"
              : "bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
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
