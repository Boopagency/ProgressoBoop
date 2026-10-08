"use client"

import { ChevronRight, MessageSquarePlus, Plus } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteChannel, leaveChannel, loadChannelCounts, updateChannel } from "@/features/channels/actions"
import { ChannelDialog, type ChannelDialogState } from "@/features/channels/channel-dialog"
import { ChannelGlyph, Conversation, type ChannelMenuItem, type ConversationView } from "@/features/channels/conversation"
import {
  channelLabel,
  channelTitle,
  groupChannels,
  totalsOf,
  type ChannelCounts,
  type ChannelEntry,
} from "@/features/channels/logic"
import { useUnread } from "@/features/channels/unread-provider"
import { CommunicationDialog, type CommunicationDialogState } from "@/features/communications/communication-dialog"
import { loadPost } from "@/features/content/actions"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import type { Communication } from "@/lib/types"
import { cn } from "@/lib/utils"

/** A lista pergunta as contagens de todos os canais de tempos em tempos. */
const COUNTS_POLL_MS = 15000

function urlFor(params: { canal?: string | null; ver?: ConversationView }) {
  const search = new URLSearchParams()
  if (params.canal) search.set("canal", params.canal)
  if (params.canal && params.ver === "pending") search.set("ver", "pendentes")
  const query = search.toString()
  return query ? `/comunicacoes?${query}` : "/comunicacoes"
}

/** Pendentes (laranja) e não lidas (cor da marca), com o texto para leitores de tela. */
function CountBadges({ pending, unread }: { pending: number; unread: number }) {
  return (
    <>
      {pending > 0 ? (
        <span
          title={`${pending} ${pending === 1 ? "pedido de ajuste pendente" : "pedidos de ajuste pendentes"}`}
          className="rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800 tabular-nums"
        >
          {pending}
          <span className="sr-only"> {pending === 1 ? "pendente" : "pendentes"}</span>
        </span>
      ) : null}
      {unread > 0 ? (
        <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[11px] font-semibold text-brand-navy tabular-nums">
          {unread > 99 ? "99+" : unread}
          <span className="sr-only"> não {unread === 1 ? "lida" : "lidas"}</span>
        </span>
      ) : null}
    </>
  )
}

function ChannelRow({
  channel,
  label,
  selected,
  onSelect,
}: {
  channel: ChannelEntry
  label: string
  selected: boolean
  onSelect: () => void
}) {
  const { unread, pending } = channel.counts
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          selected ? "bg-accent font-medium text-foreground" : "text-sidebar-foreground hover:bg-muted/70",
          unread > 0 && !selected && "font-semibold text-foreground"
        )}
      >
        <span aria-hidden="true" className="flex">
          <ChannelGlyph channel={channel} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <CountBadges pending={pending} unread={unread} />
      </button>
    </li>
  )
}

function Group({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="py-1.5" aria-label={title}>
      <div className="flex h-7 items-center px-2">
        <h2 className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Comunicações em canais, estilo Slack: à esquerda os canais (clientes,
 * internos e conversas diretas) com não lidas e pendentes; à direita a
 * conversa. `?canal=` abre um canal; `?cliente=` abre o canal do cliente;
 * `?ver=pendentes` abre os pendentes; `?q=` já busca no canal.
 */
export function ChannelsView({
  channels,
  communications,
  initialQuery,
}: {
  channels: ChannelEntry[]
  communications: Communication[]
  initialQuery: string
}) {
  const searchParams = useSearchParams()
  const { clientById, profileById, currentUser } = useWorkspace()
  const unreadTotals = useUnread()
  const [polledCounts, setPolledCounts] = useState<Record<string, ChannelCounts> | null>(null)
  const [serverChannels, setServerChannels] = useState(channels)
  const [dialog, setDialog] = useState<ChannelDialogState>({ open: false })
  const [communicationDialog, setCommunicationDialog] = useState<CommunicationDialogState>({ open: false, key: 0 })
  const [confirmDelete, setConfirmDelete] = useState<ChannelEntry | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [, startTransition] = useTransition()
  const postDialog = usePostDialog()

  // Lista nova do servidor (canal criado, renomeado…): as contagens dela valem.
  if (serverChannels !== channels) {
    setServerChannels(channels)
    setPolledCounts(null)
  }

  const ctx = { clientById, profileById, me: currentUser.id }
  const entries = channels.map((channel) => ({ ...channel, counts: polledCounts?.[channel.id] ?? channel.counts }))
  const groups = groupChannels(entries, ctx)

  const canalParam = searchParams.get("canal")
  const clientParam = searchParams.get("cliente")
  const selected =
    entries.find((channel) => channel.id === canalParam) ??
    (clientParam ? entries.find((channel) => channel.kind === "client" && channel.client_id === clientParam) : undefined) ??
    null
  const view: ConversationView = searchParams.get("ver") === "pendentes" ? "pending" : "thread"
  const query = searchParams.get("q") ?? initialQuery

  function refreshCounts() {
    void loadChannelCounts().then((result) => {
      if (result.ok) setPolledCounts(result.data)
    })
    unreadTotals.refresh()
  }

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return
      void loadChannelCounts().then((result) => {
        if (result.ok) setPolledCounts(result.data)
      })
    }
    const timer = window.setInterval(poll, COUNTS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  function select(channelId: string | null, nextView: ConversationView = "thread") {
    window.history.pushState(null, "", urlFor({ canal: channelId, ver: nextView }))
  }

  // ?novo= (busca geral, "Registrar comunicação"): registra um contato.
  useUrlTrigger(() =>
    setCommunicationDialog((current) => ({
      open: true,
      key: current.key + 1,
      defaults: selected?.client_id ? { client_id: selected.client_id } : undefined,
    }))
  )

  function openPost(postId: string) {
    void loadPost(postId).then((result) => {
      if (result.ok) postDialog.openPost(result.data)
      else toast.error(result.error)
    })
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar.")
        return
      }
      toast.success(success)
      after?.()
      refreshCounts()
    })
  }

  function menuFor(channel: ChannelEntry): ChannelMenuItem[] {
    const archive: ChannelMenuItem = channel.archived
      ? { label: "Desarquivar", onSelect: () => run(() => updateChannel(channel.id, { archived: false }), "Canal desarquivado") }
      : {
          label: "Arquivar",
          separated: true,
          onSelect: () => run(() => updateChannel(channel.id, { archived: true }), "Canal arquivado"),
        }
    if (channel.kind === "client") {
      return [
        {
          label: "Registrar contato (ligação, reunião…)",
          onSelect: () =>
            setCommunicationDialog((current) => ({
              open: true,
              key: current.key + 1,
              defaults: channel.client_id ? { client_id: channel.client_id } : undefined,
            })),
        },
        archive,
      ]
    }
    if (channel.kind === "direct") return [archive]
    return [
      { label: "Nome e participantes", onSelect: () => setDialog({ open: true, mode: "edit", channel }) },
      archive,
      { label: "Sair do canal", onSelect: () => run(() => leaveChannel(channel.id), "Você saiu do canal", () => select(null)) },
      { label: "Excluir canal…", destructive: true, onSelect: () => setConfirmDelete(channel) },
    ]
  }

  const totals = totalsOf(entries)
  const clientCommunications = selected?.client_id
    ? communications.filter((communication) => communication.client_id === selected.client_id)
    : []

  function rows(list: ChannelEntry[]) {
    return (
      <ul className="space-y-px">
        {list.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            label={channelLabel(channel, ctx)}
            selected={selected?.id === channel.id}
            onSelect={() => select(channel.id)}
          />
        ))}
      </ul>
    )
  }

  const withPending = entries.filter((channel) => !channel.archived && channel.counts.pending > 0)
  const withUnread = entries.filter((channel) => !channel.archived && channel.counts.unread > 0)

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0 md:h-full">
      <nav
        aria-label="Canais"
        className={cn("flex w-full shrink-0 flex-col border-r bg-sidebar/40 md:w-72", selected && "max-md:hidden")}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">Comunicações</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground"
                aria-label="Nova conversa"
                onClick={() => setDialog({ open: true, mode: "direct" })}
              >
                <MessageSquarePlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nova conversa</TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <Group title="Clientes">{groups.clients.length > 0 ? rows(groups.clients) : <p className="px-2 text-xs text-muted-foreground">Nenhum cliente ativo.</p>}</Group>
          <Group
            title="Canais"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Novo canal"
                onClick={() => setDialog({ open: true, mode: "new" })}
                className="size-6 text-muted-foreground"
              >
                <Plus className="size-3.5" />
              </Button>
            }
          >
            {groups.internal.length > 0 ? (
              rows(groups.internal)
            ) : (
              <button
                type="button"
                onClick={() => setDialog({ open: true, mode: "new" })}
                className="px-2 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                Crie um canal por assunto (ex.: Financeiro).
              </button>
            )}
          </Group>
          <Group
            title="Conversas"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Nova conversa direta"
                onClick={() => setDialog({ open: true, mode: "direct" })}
                className="size-6 text-muted-foreground"
              >
                <Plus className="size-3.5" />
              </Button>
            }
          >
            {groups.direct.length > 0 ? (
              rows(groups.direct)
            ) : (
              <button
                type="button"
                onClick={() => setDialog({ open: true, mode: "direct" })}
                className="px-2 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                Converse direto com alguém da equipe.
              </button>
            )}
          </Group>
          {groups.archived.length > 0 ? (
            <section className="py-1.5" aria-label="Arquivados">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((value) => !value)}
                className="flex h-7 w-full items-center gap-1 px-2 text-[11px] font-medium tracking-wide text-subtle-foreground uppercase hover:text-foreground"
              >
                <ChevronRight className={cn("size-3 transition-transform", showArchived && "rotate-90")} aria-hidden="true" />
                <span className="flex-1 text-left">Arquivados e clientes inativos ({groups.archived.length})</span>
                {/* Recolhido, o grupo mostra o que os canais dele têm (o selo da barra lateral conta os de clientes inativos). */}
                {showArchived ? null : (
                  <span className="flex items-center gap-1 normal-case tracking-normal">
                    <CountBadges
                      pending={groups.archived.reduce((sum, channel) => sum + channel.counts.pending, 0)}
                      unread={groups.archived.reduce((sum, channel) => sum + channel.counts.unread, 0)}
                    />
                  </span>
                )}
              </button>
              {showArchived ? rows(groups.archived) : null}
            </section>
          ) : null}
        </div>
      </nav>

      <div className={cn("flex min-w-0 flex-1 flex-col", !selected && "max-md:hidden")}>
        {selected ? (
          <Conversation
            key={selected.id}
            channel={selected}
            title={channelTitle(selected, ctx)}
            communications={clientCommunications}
            view={view}
            initialQuery={selected.client_id === clientParam ? query : ""}
            menu={menuFor(selected)}
            onView={(next) => select(selected.id, next)}
            onBack={() => select(null)}
            onRead={refreshCounts}
            onOpenPost={openPost}
            onOpenCommunication={(communication) =>
              setCommunicationDialog((current) => ({ open: true, key: current.key + 1, communication }))
            }
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <h2 className="text-base font-semibold text-foreground">Escolha um canal</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Cada cliente tem o canal “Alterações”, com os pedidos de ajuste e o chat dos posts. A equipe também tem
              canais por assunto e conversas diretas.
            </p>
            {totals.pending > 0 || totals.unread > 0 ? (
              <div className="mt-6 w-full max-w-sm space-y-4 text-left">
                {withPending.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Pedidos de ajuste pendentes ({totals.pending})</p>
                    <ul className="mt-1.5 divide-y rounded-lg border bg-card">
                      {withPending.map((channel) => (
                        <li key={channel.id}>
                          <button
                            type="button"
                            onClick={() => select(channel.id, "pending")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted/50"
                          >
                            <span aria-hidden="true" className="flex">
                              <ChannelGlyph channel={channel} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{channelLabel(channel, ctx)}</span>
                            <CountBadges pending={channel.counts.pending} unread={0} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {withUnread.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Não lidas ({totals.unread})</p>
                    <ul className="mt-1.5 divide-y rounded-lg border bg-card">
                      {withUnread.map((channel) => (
                        <li key={channel.id}>
                          <button
                            type="button"
                            onClick={() => select(channel.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted/50"
                          >
                            <span aria-hidden="true" className="flex">
                              <ChannelGlyph channel={channel} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{channelLabel(channel, ctx)}</span>
                            <CountBadges pending={0} unread={channel.counts.unread} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ChannelDialog state={dialog} onClose={() => setDialog({ open: false })} onSelect={(id) => select(id)} />
      <CommunicationDialog
        state={communicationDialog}
        onOpenChange={(open) => setCommunicationDialog((current) => ({ ...current, open }))}
      />
      <PostDialog state={postDialog.state} onOpenChange={postDialog.onOpenChange} />
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => (open ? null : setConfirmDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o canal “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens saem para todos os participantes. As tarefas criadas a partir delas continuam. Para guardar a
              conversa, arquive em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const channel = confirmDelete
                setConfirmDelete(null)
                if (channel) run(() => deleteChannel(channel.id), "Canal excluído", () => select(null))
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
