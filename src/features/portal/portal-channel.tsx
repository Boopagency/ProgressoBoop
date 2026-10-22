"use client"

import { ChevronLeft, FolderKanban, Megaphone } from "lucide-react"
import Link from "next/link"
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Composer } from "@/features/channels/composer"
import { ThreadView } from "@/features/channels/thread-view"
import {
  loadPortalDirectThread,
  loadPortalThread,
  readPortalChannel,
  readPortalDirect,
  sendPortalChannelMessage,
  sendPortalDirectMessage,
} from "@/features/portal/channel-actions"
import {
  buildPortalThread,
  mergePortalMessages,
  newestMessageAt,
  PORTAL_THREAD_POLL_MS,
  type PortalThreadItem,
} from "@/features/portal/channel-logic"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import { portalHref } from "@/features/portal/links"
import { searchPortalMentions } from "@/features/mentions/actions"
import { PortalMessageBubble } from "@/features/portal/message-bubble"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import type { PortalClient } from "@/features/portal/session"
import { sendPortalChannelAudio, sendPortalDirectAudio } from "@/features/voice/actions"
import { deliverRecording, type Recording } from "@/features/voice/upload"
import { todayKey, toTimeLabel } from "@/lib/dates"
import { cn } from "@/lib/utils"

/**
 * Comunicação no portal: o canal do cliente com a equipe, como a conversa da
 * equipe (fio por dia, mensagens seguidas juntas, Enter envia). Busca de novo
 * a cada poucos segundos com a aba visível; com o fio na tela, marca como
 * lido até a mensagem mais nova e atualiza o contador do menu. Com
 * `direct`, é a conversa direta com alguém da equipe (o mesmo fio, pelas
 * funções `portal_direct_*`). No celular, a conversa aberta da lista
 * (`mobile`) fica em tela cheia, com o topo (voltar, foto e nome) e o campo
 * embaixo, que sobe com o teclado; com a lista na tela (`hiddenOnMobile`),
 * ela não busca nem marca como lido.
 */
export function PortalChannel({
  client,
  clients,
  initialMessages,
  initialHasMore,
  archived,
  direct = null,
  mobile = null,
  hiddenOnMobile = false,
}: {
  client: PortalClient
  clients: readonly PortalClient[]
  initialMessages: PortalChannelMessage[]
  initialHasMore: boolean
  archived: boolean
  /** Conversa direta: o canal e quem da equipe participa. */
  direct?: { channelId: string; teamName: string } | null
  /** Tela cheia no celular: para onde volta (a lista), a foto, o nome e a linha de baixo. */
  mobile?: { backHref: string; avatar: ReactNode; title: string; subtitle: string } | null
  /** No celular, a lista de conversas está na tela no lugar desta. */
  hiddenOnMobile?: boolean
}) {
  const clientId = client.id
  const directId = direct?.channelId ?? null
  const load = (olderThan?: string) => (directId ? loadPortalDirectThread(directId, olderThan) : loadPortalThread(clientId, olderThan))
  const { refresh: refreshCounts } = usePortalAlerts()
  const [latest, setLatest] = useState(initialMessages)
  const [older, setOlder] = useState<PortalChannelMessage[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const lastRead = useRef<string | null>(null)
  const today = todayKey()
  const messages = mergePortalMessages(older, latest)
  const newest = newestMessageAt(messages)

  async function loadLatest() {
    const result = await load().catch(() => null)
    if (!result) {
      setError("Sem conexão. Tentando de novo…")
      return
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setLatest(result.data.messages)
    if (older.length === 0) setHasMore(result.data.hasMore)
  }

  /** Escondida no celular (a lista está na tela): não busca nem marca como lido. */
  const offScreen = () => hiddenOnMobile && window.matchMedia("(max-width: 767px)").matches

  const fetchLatest = useEffectEvent(() => (offScreen() ? undefined : loadLatest()))

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchLatest()
    }, PORTAL_THREAD_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchLatest()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [clientId, directId])

  // Lido = a mensagem mais nova que está na tela, com a aba visível.
  const markRead = useEffectEvent(async () => {
    if (!newest || newest === lastRead.current || document.visibilityState !== "visible" || offScreen()) return
    lastRead.current = newest
    const result = await (directId ? readPortalDirect(directId, newest) : readPortalChannel(clientId, newest)).catch(() => null)
    if (result?.ok) refreshCounts()
    else lastRead.current = null
  })

  useEffect(() => {
    void markRead()
    document.addEventListener("visibilitychange", markRead)
    return () => document.removeEventListener("visibilitychange", markRead)
  }, [newest])

  async function loadOlder() {
    const oldest = messages[0]
    if (!oldest) return
    const result = await load(oldest.created_at).catch(() => null)
    if (!result?.ok) {
      setError(result?.error ?? "Sem conexão. Tente de novo.")
      return
    }
    setOlder((current) => mergePortalMessages(result.data.messages, current))
    setHasMore(result.data.hasMore)
  }

  async function send(body: string): Promise<boolean> {
    const result = await (directId ? sendPortalDirectMessage(directId, body) : sendPortalChannelMessage(clientId, body)).catch(() => null)
    if (!result?.ok) {
      toast.error(result?.error ?? "Sem conexão. A mensagem não foi enviada.")
      return false
    }
    setSentCount((value) => value + 1)
    await loadLatest()
    return true
  }

  async function sendAudio(recording: Recording): Promise<boolean> {
    const result = await deliverRecording(recording, (path) =>
      directId ? sendPortalDirectAudio(directId, path, recording.durationMs) : sendPortalChannelAudio(clientId, path, recording.durationMs)
    )
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    setSentCount((value) => value + 1)
    await loadLatest()
    return true
  }

  return (
    <section
      aria-label={direct ? `Conversa com ${direct.teamName}` : "Conversa com a equipe"}
      className={cn(
        "flex h-[calc(100svh-15rem-var(--app-bottom-bar,0px))] min-h-96 flex-col overflow-hidden rounded-xl border bg-card md:h-[calc(100svh-17rem)]",
        hiddenOnMobile && "max-md:hidden",
        // Celular: tela cheia, por cima do topo e do menu de baixo, do tamanho da parte que se vê.
        mobile &&
          "max-md:fixed max-md:inset-x-0 max-md:top-[var(--vv-top,0px)] max-md:z-50 max-md:h-[var(--vv-height,100dvh)] max-md:min-h-0 max-md:rounded-none max-md:border-0 max-md:bg-background max-md:pb-[var(--vv-safe-bottom,env(safe-area-inset-bottom))]"
      )}
    >
      {mobile ? (
        <header className="flex shrink-0 items-center gap-1.5 border-b px-1 pt-[calc(0.25rem+env(safe-area-inset-top))] pb-1 md:hidden">
          <Link
            href={mobile.backHref}
            aria-label="Voltar para as conversas"
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </Link>
          {mobile.avatar}
          <div className="min-w-0 flex-1 pl-1">
            <h2 className="truncate text-[15px] leading-5 font-semibold text-foreground">{mobile.title}</h2>
            <p className="truncate text-xs text-muted-foreground">{mobile.subtitle}</p>
          </div>
        </header>
      ) : null}
      <ThreadView<PortalThreadItem>
        days={buildPortalThread(messages, today)}
        loaded
        error={error}
        hasMore={hasMore}
        onLoadOlder={loadOlder}
        scrollToEndKey={sentCount}
        empty={
          <p className="flex h-full items-center justify-center px-6 py-16 text-center text-[13px] leading-5 text-muted-foreground">
            {direct
              ? `Nenhuma mensagem ainda. Esta conversa é só entre você e ${direct.teamName}.`
              : "Nenhuma mensagem ainda. Escreva aqui para falar com a equipe da Boop: dúvidas, pedidos e materiais."}
          </p>
        }
        renderItem={(item) => (
          <PortalMessageRow
            key={item.key}
            item={item}
            oneToOne={direct !== null}
            href={(path) => portalHref(path, client, clients)}
          />
        )}
      />
      <Composer
        onSend={(body) => send(body)}
        onSendAudio={(recording) => sendAudio(recording)}
        allowRequest={false}
        mentions={(query) => searchPortalMentions(clientId, query)}
        placeholder={direct ? `Escreva para ${direct.teamName}` : "Escreva para a equipe da Boop"}
        disabledText={archived ? "A conversa foi encerrada pela equipe. Fale com a Boop pelos outros canais." : null}
      />
    </section>
  )
}

/** Uma mensagem do fio, com o post ou o projeto de que fala (se houver). */
function PortalMessageRow({
  item,
  href,
  oneToOne,
}: {
  item: PortalThreadItem
  href: (path: string) => string
  oneToOne: boolean
}) {
  const { message, continued } = item
  const context = message.post
    ? { icon: Megaphone, label: message.post.title, path: `/portal/posts/${message.post.id}` }
    : message.project
      ? { icon: FolderKanban, label: message.project.name, path: `/portal/projetos/${message.project.id}` }
      : null

  return (
    <PortalMessageBubble message={message} time={toTimeLabel(message.created_at)} continued={continued} oneToOne={oneToOne} mentionHref={href}>
      {context ? (
        <Link
          href={href(context.path)}
          className="mt-1.5 flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <context.icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{context.label}</span>
        </Link>
      ) : null}
    </PortalMessageBubble>
  )
}
