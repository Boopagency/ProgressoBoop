"use client"

import { ArrowLeft, Hash, MoreHorizontal, Search, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { loadThread, markChannelRead, sendMessage } from "@/features/channels/actions"
import { Composer } from "@/features/channels/composer"
import {
  buildThread,
  directPartner,
  filterCommunications,
  filterThread,
  type ChannelEntry,
  type ThreadItem,
} from "@/features/channels/logic"
import { MessageItem } from "@/features/channels/message-item"
import { ThreadView } from "@/features/channels/thread-view"
import { useThread } from "@/features/channels/use-thread"
import { ChannelIcon, CommunicationKindBadge } from "@/features/communications/communication-meta"
import { ClientMark } from "@/features/content/post-meta"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, toDateKey } from "@/lib/dates"
import type { Communication } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ConversationView = "thread" | "pending"

export interface ChannelMenuItem {
  label: string
  onSelect: () => void
  destructive?: boolean
  separated?: boolean
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  window.addEventListener("focus", onChange)
  window.addEventListener("blur", onChange)
  return () => {
    document.removeEventListener("visibilitychange", onChange)
    window.removeEventListener("focus", onChange)
    window.removeEventListener("blur", onChange)
  }
}

/** A pessoa está olhando a tela (aba visível e janela em foco). */
function usePageActive(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible" && document.hasFocus(),
    () => false
  )
}

/** Ícone do canal: a foto do cliente, "#" do canal interno ou a outra pessoa. */
export function ChannelGlyph({ channel, size = "sm" }: { channel: ChannelEntry; size?: "sm" | "md" }) {
  const { currentUser, profiles, profileById } = useWorkspace()
  if (channel.kind === "client" && channel.client_id) {
    return <ClientMark clientId={channel.client_id} size={size === "md" ? "md" : "sm"} />
  }
  if (channel.kind === "direct") {
    const partner = directPartner(channel, currentUser.id)
    const profile = partner ? profileById.get(partner) : undefined
    return (
      <PersonAvatar
        name={profile?.full_name ?? "?"}
        avatarUrl={profile?.avatar_url}
        colorIndex={profile ? profiles.indexOf(profile) : 0}
        size="sm"
        className={cn(size === "md" ? "size-7" : "size-5 [&_[data-slot=avatar-fallback]]:text-[10px]")}
      />
    )
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", size === "md" ? "size-7" : "size-5")}>
      <Hash className={size === "md" ? "size-4" : "size-3"} aria-hidden="true" />
    </span>
  )
}

/** Registro antigo de `communications` no fio do cliente (só a equipe vê). */
function CommunicationEntry({ communication, onOpen }: { communication: Communication; onOpen: () => void }) {
  const { profileById } = useWorkspace()
  const { tasks, today } = useTasks()
  const author = profileById.get(communication.created_by)
  const becameTask = tasks.some((task) => task.communication_id === communication.id)
  return (
    <li className="px-4 py-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full max-w-2xl items-start gap-2.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <ChannelIcon channel={communication.channel} className="mt-1 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-5 font-medium text-foreground">{communication.summary}</span>
          {communication.details ? (
            <span className="line-clamp-2 block text-xs leading-5 whitespace-pre-line text-muted-foreground">{communication.details}</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-medium">Registro</span>
            <CommunicationKindBadge kind={communication.kind} />
            <span className="tabular-nums">{formatShortDate(communication.occurred_on, today)}</span>
            {author ? <span>· {firstName(author.full_name)}</span> : null}
            {becameTask ? <span>· virou tarefa</span> : null}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Conversa de um canal: cabeçalho, "Conversa" ou "Pendentes", busca, o fio
 * (com os registros antigos, no canal de cliente) e o campo de escrever. O
 * fio se atualiza sozinho e marca o canal como lido enquanto a pessoa olha.
 */
export function Conversation({
  channel,
  title,
  communications,
  view,
  initialQuery,
  menu,
  onView,
  onBack,
  onRead,
  onOpenPost,
  onOpenCommunication,
}: {
  channel: ChannelEntry
  title: string
  /** Registros antigos do cliente (só no canal de cliente). */
  communications: Communication[]
  view: ConversationView
  initialQuery: string
  menu: ChannelMenuItem[]
  onView: (view: ConversationView) => void
  onBack: () => void
  /** O canal foi marcado como lido (ou a pessoa mexeu em algo): contagens novas. */
  onRead: () => void
  onOpenPost: (postId: string) => void
  onOpenCommunication: (communication: Communication) => void
}) {
  const { profileById, clientById } = useWorkspace()
  const { today } = useTasks()
  const thread = useThread(channel.id, (before) => loadThread(channel.id, before))
  const [query, setQuery] = useState(initialQuery)
  const [searchOpen, setSearchOpen] = useState(initialQuery !== "")
  const [sentCount, setSentCount] = useState(0)
  const active = usePageActive()
  const readUpTo = useRef<string | null>(null)
  const messages = thread.messages
  const newest = messages && messages.length > 0 ? messages[messages.length - 1] : undefined

  // Lido até a mensagem mais nova, enquanto a pessoa está olhando o canal
  // (ao abrir e a cada mensagem nova que chega).
  useEffect(() => {
    if (!active || !newest) return
    if (readUpTo.current && readUpTo.current >= newest.created_at) return
    readUpTo.current = newest.created_at
    void markChannelRead(channel.id, newest.created_at).then((result) => {
      if (result.ok) onRead()
    })
  }, [active, newest, channel.id, onRead])

  async function send(body: string, kind: "text" | "change_request" | "approval") {
    const result = await sendMessage({ channel_id: channel.id, body, kind, post_id: null })
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    thread.addLocal(result.data)
    setSentCount((value) => value + 1)
    return true
  }

  function changed() {
    thread.refresh()
    onRead()
  }

  const visibleMessages = filterThread(messages ?? [], query)
  const visibleCommunications = channel.kind === "client" ? filterCommunications(communications, query) : []
  const days = buildThread(visibleMessages, visibleCommunications, today)
  const pendingCount = thread.messages === null ? channel.counts.pending : thread.pending.length

  const subtitle: ReactNode =
    channel.kind === "client" && channel.client_id ? (
      <>
        Canal do cliente · toda a equipe ·{" "}
        <Link href={`/clientes/${channel.client_id}`} className="hover:text-foreground hover:underline">
          ver {clientById.get(channel.client_id)?.name ?? "cliente"}
        </Link>
      </>
    ) : channel.kind === "internal" ? (
      channel.member_ids.map((id) => firstName(profileById.get(id)?.full_name ?? "?")).join(", ") || "Sem participantes"
    ) : (
      "Conversa direta"
    )

  function renderItem(item: ThreadItem) {
    if (item.type === "communication") {
      return <CommunicationEntry key={item.key} communication={item.communication} onOpen={() => onOpenCommunication(item.communication)} />
    }
    return (
      <MessageItem
        key={item.key}
        message={item.message}
        continued={item.continued}
        canWrite={!channel.archived}
        onChanged={changed}
        onRemoved={thread.removeLocal}
        onOpenPost={onOpenPost}
      />
    )
  }

  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-2 py-2 sm:flex-nowrap sm:px-4">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Voltar para os canais" className="md:hidden">
          <ArrowLeft />
        </Button>
        <ChannelGlyph channel={channel} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] leading-5 font-semibold text-foreground">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {channel.archived ? "Arquivado · " : ""}
            {subtitle}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="O que mostrar"
          className="flex shrink-0 rounded-lg bg-muted p-0.5 max-sm:order-last max-sm:basis-full max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center"
        >
          {(
            [
              ["thread", "Conversa"],
              ["pending", "Pendentes"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => onView(value)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                view === value ? "bg-background font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {value === "pending" && pendingCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800 tabular-nums">{pendingCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Buscar no canal"
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open)
            if (searchOpen) setQuery("")
          }}
          className="text-muted-foreground max-sm:hidden"
        >
          <Search />
        </Button>
        {menu.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Opções do canal" className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {menu.map((item) => (
                <span key={item.label}>
                  {item.separated ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} onSelect={item.onSelect}>
                    {item.label}
                  </DropdownMenuItem>
                </span>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      {searchOpen && view === "thread" ? (
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar neste canal (mensagens carregadas e registros)"
            aria-label="Buscar neste canal"
            className="h-8 border-0 px-0 text-[13px] shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar a busca"
            onClick={() => {
              setQuery("")
              setSearchOpen(false)
            }}
            className="text-muted-foreground"
          >
            <X />
          </Button>
        </div>
      ) : null}

      {view === "pending" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {thread.pending.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              {thread.messages === null ? "Carregando…" : "Nenhum pedido de ajuste pendente neste canal."}
            </p>
          ) : (
            <ul className="py-2">
              {thread.pending.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  canWrite={!channel.archived}
                  onChanged={changed}
                  onRemoved={thread.removeLocal}
                  onOpenPost={onOpenPost}
                  extra={<span className="text-xs text-muted-foreground tabular-nums">{formatShortDate(toDateKey(message.created_at), today)}</span>}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ThreadView
          days={days}
          loaded={messages !== null}
          error={thread.error}
          hasMore={thread.hasMore && !query.trim()}
          onLoadOlder={thread.loadOlder}
          scrollToEndKey={sentCount}
          empty={
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">{query.trim() ? "Nada encontrado." : "Nenhuma mensagem ainda."}</p>
              {query.trim() ? null : (
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                  {channel.kind === "client"
                    ? "Escreva para a equipe sobre este cliente. Pedidos de ajuste ficam pendentes até alguém resolver (ou a tarefa ser concluída)."
                    : "Comece a conversa."}
                </p>
              )}
            </div>
          }
          renderItem={renderItem}
        />
      )}

      {view === "thread" ? (
        <Composer
          key={channel.id}
          onSend={send}
          allowRequest={channel.kind === "client"}
          autoFocus
          placeholder={channel.kind === "direct" ? `Mensagem para ${title}` : `Mensagem em ${title}`}
          disabledText={channel.archived ? "Canal arquivado. Desarquive pelo menu para voltar a escrever." : null}
        />
      ) : null}
    </section>
  )
}
