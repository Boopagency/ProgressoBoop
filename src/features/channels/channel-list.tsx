"use client"

import { Hash, Lock, MessageSquarePlus, Search, UserRound, UsersRound } from "lucide-react"
import { useState, type ReactNode } from "react"

import { MoreSheet, MoreSheetItem, MoreSheetSection } from "@/components/layout/more-sheet"
import type { ChannelDialogState } from "@/features/channels/channel-dialog"
import { ChannelGlyph } from "@/features/channels/conversation"
import {
  channelLabel,
  clientDirectPerson,
  groupChannels,
  isClientDirect,
  listTimeLabel,
  sortByRecent,
  type ChannelEntry,
  type ChannelPreview,
} from "@/features/channels/logic"
import { useAuthor } from "@/features/channels/message-item"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { includesText } from "@/lib/text"
import { cn } from "@/lib/utils"

type Filter = "all" | "unread" | "pending" | "archived"

/** Quem escreveu a última mensagem, antes do texto: "Você" ou o primeiro nome (nos canais com várias pessoas). */
function PreviewAuthor({ authorId, group }: { authorId: string | null; group: boolean }) {
  const { currentUser } = useWorkspace()
  const author = useAuthor(authorId)
  if (authorId === currentUser.id) return <>Você: </>
  return group && authorId ? <>{author.name}: </> : null
}

/** A segunda linha da conversa: a última mensagem (ou do que se trata, se não tem). */
function PreviewLine({ channel, preview }: { channel: ChannelEntry; preview?: ChannelPreview }) {
  const { profileById, clientPersonById } = useWorkspace()
  if (!preview) {
    const text =
      channel.kind === "client"
        ? "Canal do cliente"
        : isClientDirect(channel)
          ? `Conversa com ${clientDirectPerson(channel, { clientPersonById })}`
          : channel.kind === "internal"
            ? channel.member_ids.map((id) => firstName(profileById.get(id)?.full_name ?? "?")).join(", ") || "Canal"
            : "Conversa direta"
    return <span className="truncate italic">{text}</span>
  }
  const group = channel.kind !== "direct"
  return (
    <span className={cn("flex min-w-0 items-center gap-1", preview.kind === "system" && "italic")}>
      {preview.internal ? <Lock className="size-3.5 shrink-0" aria-label="Interna" /> : null}
      <span className="truncate">
        {preview.kind === "system" ? null : <PreviewAuthor authorId={preview.author_id} group={group} />}
        {preview.body.replace(/\s+/g, " ")}
      </span>
    </span>
  )
}

function Badges({ pending, unread }: { pending: number; unread: number }) {
  return (
    <>
      {pending > 0 ? (
        <span className="rounded-full bg-attention-muted px-1.5 text-[11px] leading-5 font-medium text-attention-ink tabular-nums">
          {pending}
          <span className="sr-only"> {pending === 1 ? "pendente" : "pendentes"}</span>
        </span>
      ) : null}
      {unread > 0 ? (
        <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[11px] leading-5 font-semibold text-brand-navy tabular-nums">
          {unread > 99 ? "99+" : unread}
          <span className="sr-only"> não {unread === 1 ? "lida" : "lidas"}</span>
        </span>
      ) : null}
    </>
  )
}

function Row({
  channel,
  label,
  preview,
  today,
  onSelect,
}: {
  channel: ChannelEntry
  label: string
  preview?: ChannelPreview
  today: string
  onSelect: () => void
}) {
  const { unread, pending } = channel.counts
  const at = channel.counts.last_message_at ?? preview?.created_at ?? null
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 text-left outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-accent active:bg-accent"
      >
        <ChannelGlyph channel={channel} size="lg" />
        <span className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border/70 py-2">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[15.5px] text-foreground", unread > 0 ? "font-semibold" : "font-medium")}>
              {label}
            </span>
            {at ? (
              <time dateTime={at} className={cn("shrink-0 text-xs tabular-nums", unread > 0 ? "font-medium text-brand-ink" : "text-muted-foreground")}>
                {listTimeLabel(at, today)}
              </time>
            ) : null}
          </span>
          <span className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
            <span className="flex min-w-0 flex-1">
              <PreviewLine channel={channel} preview={preview} />
            </span>
            <Badges pending={pending} unread={unread} />
          </span>
        </span>
      </button>
    </li>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors outline-none touch-target focus-visible:ring-2 focus-visible:ring-ring/40",
        active ? "bg-brand-soft font-medium text-brand-ink" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Comunicações no celular, como nos aplicativos de conversa: todas as
 * conversas numa lista, a mais recente primeiro, com a foto, o nome, a
 * última mensagem, a hora e as não lidas; a busca pelo nome; filtros (não
 * lidas, pendentes, arquivadas); e o botão de nova conversa. Tocar abre a
 * conversa em tela cheia.
 */
export function MobileChannelList({
  channels,
  previews,
  onSelect,
  onNew,
}: {
  channels: ChannelEntry[]
  previews: Readonly<Record<string, ChannelPreview>>
  onSelect: (channelId: string) => void
  onNew: (state: ChannelDialogState) => void
}) {
  const { clientById, profileById, clientPersonById, currentUser } = useWorkspace()
  const { today } = useTasks()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  const ctx = { clientById, profileById, clientPersonById, me: currentUser.id }
  const groups = groupChannels(channels, ctx)
  const active = [...groups.clients, ...groups.clientDirect, ...groups.internal, ...groups.direct]
  const unreadCount = active.filter((channel) => channel.counts.unread > 0).length
  const pendingCount = active.filter((channel) => channel.counts.pending > 0).length

  const base = filter === "archived" ? groups.archived : active
  const shown = sortByRecent(
    base.filter(
      (channel) =>
        (filter !== "unread" || channel.counts.unread > 0) &&
        (filter !== "pending" || channel.counts.pending > 0) &&
        (!query.trim() || includesText(channelLabel(channel, ctx), query))
    ),
    previews,
    ctx
  )

  function startNew(state: ChannelDialogState) {
    setNewOpen(false)
    window.setTimeout(() => onNew(state), 150)
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col md:hidden">
      <div className="shrink-0 space-y-2.5 px-4 pt-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full bg-muted px-3.5 text-muted-foreground">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversa"
            aria-label="Buscar conversa"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-subtle-foreground"
          />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Mostrar">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Todas
          </Chip>
          <Chip active={filter === "unread"} onClick={() => setFilter("unread")}>
            Não lidas{unreadCount > 0 ? <span className="tabular-nums">{unreadCount}</span> : null}
          </Chip>
          <Chip active={filter === "pending"} onClick={() => setFilter("pending")}>
            Pendentes{pendingCount > 0 ? <span className="tabular-nums">{pendingCount}</span> : null}
          </Chip>
          {groups.archived.length > 0 ? (
            <Chip active={filter === "archived"} onClick={() => setFilter("archived")}>
              Arquivadas
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
        {shown.length > 0 ? (
          <ul aria-label="Conversas">
            {shown.map((channel) => (
              <Row
                key={channel.id}
                channel={channel}
                label={channelLabel(channel, ctx)}
                preview={previews[channel.id]}
                today={today}
                onSelect={() => onSelect(channel.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "Nenhuma conversa com esse nome."
              : filter === "unread"
                ? "Nenhuma conversa com mensagens não lidas."
                : filter === "pending"
                  ? "Nenhum pedido de ajuste pendente."
                  : "Nenhuma conversa ainda."}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setNewOpen(true)}
        aria-haspopup="dialog"
        aria-label="Nova conversa"
        className="fixed right-4 bottom-[calc(var(--app-bottom-bar,0px)+1rem)] z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_4px_12px_rgb(0_0_0/0.18)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95"
      >
        <MessageSquarePlus className="size-6" aria-hidden="true" />
      </button>

      <MoreSheet open={newOpen} onOpenChange={setNewOpen} title="Nova conversa" description="Com quem conversar.">
        <MoreSheetSection>
          <MoreSheetItem title="Com alguém da equipe" icon={UserRound} onClick={() => startNew({ open: true, mode: "direct" })} />
          <MoreSheetItem title="Com alguém do cliente" icon={UsersRound} onClick={() => startNew({ open: true, mode: "client" })} />
          <MoreSheetItem title="Novo canal da equipe" icon={Hash} onClick={() => startNew({ open: true, mode: "new" })} />
        </MoreSheetSection>
      </MoreSheet>
    </div>
  )
}
