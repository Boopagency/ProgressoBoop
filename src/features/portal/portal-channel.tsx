"use client"

import { FolderKanban, Megaphone } from "lucide-react"
import Link from "next/link"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import { Composer } from "@/features/channels/composer"
import { ThreadView } from "@/features/channels/thread-view"
import { loadPortalThread, readPortalChannel, sendPortalChannelMessage } from "@/features/portal/channel-actions"
import {
  buildPortalThread,
  mergePortalMessages,
  newestMessageAt,
  PORTAL_THREAD_POLL_MS,
  type PortalThreadItem,
} from "@/features/portal/channel-logic"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import { portalHref } from "@/features/portal/links"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import type { PortalClient } from "@/features/portal/session"
import { todayKey, toTimeLabel } from "@/lib/dates"
import { MESSAGE_KIND_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Comunicação no portal: o canal do cliente com a equipe, como a conversa da
 * equipe (fio por dia, mensagens seguidas juntas, Enter envia). Busca de novo
 * a cada poucos segundos com a aba visível; com o fio na tela, marca como
 * lido até a mensagem mais nova e atualiza o contador do menu.
 */
export function PortalChannel({
  client,
  clients,
  initialMessages,
  initialHasMore,
  archived,
}: {
  client: PortalClient
  clients: readonly PortalClient[]
  initialMessages: PortalChannelMessage[]
  initialHasMore: boolean
  archived: boolean
}) {
  const clientId = client.id
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
    const result = await loadPortalThread(clientId).catch(() => null)
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

  const fetchLatest = useEffectEvent(() => loadLatest())

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
  }, [clientId])

  // Lido = a mensagem mais nova que está na tela, com a aba visível.
  const markRead = useEffectEvent(async () => {
    if (!newest || newest === lastRead.current || document.visibilityState !== "visible") return
    lastRead.current = newest
    const result = await readPortalChannel(clientId, newest).catch(() => null)
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
    const result = await loadPortalThread(clientId, oldest.created_at).catch(() => null)
    if (!result?.ok) {
      setError(result?.error ?? "Sem conexão. Tente de novo.")
      return
    }
    setOlder((current) => mergePortalMessages(result.data.messages, current))
    setHasMore(result.data.hasMore)
  }

  async function send(body: string): Promise<boolean> {
    const result = await sendPortalChannelMessage(clientId, body).catch(() => null)
    if (!result?.ok) {
      toast.error(result?.error ?? "Sem conexão. A mensagem não foi enviada.")
      return false
    }
    setSentCount((value) => value + 1)
    await loadLatest()
    return true
  }

  return (
    <section
      aria-label="Conversa com a equipe"
      className="flex h-[calc(100svh-15rem)] min-h-96 flex-col overflow-hidden rounded-xl border bg-card md:h-[calc(100svh-17rem)]"
    >
      <ThreadView<PortalThreadItem>
        days={buildPortalThread(messages, today)}
        loaded
        error={error}
        hasMore={hasMore}
        onLoadOlder={loadOlder}
        scrollToEndKey={sentCount}
        empty={
          <p className="flex h-full items-center justify-center px-6 py-16 text-center text-[13px] leading-5 text-muted-foreground">
            Nenhuma mensagem ainda. Escreva aqui para falar com a equipe da Boop: dúvidas, pedidos e materiais.
          </p>
        }
        renderItem={(item) => (
          <PortalMessageRow
            key={item.key}
            item={item}
            href={(path) => portalHref(path, client, clients)}
          />
        )}
      />
      <Composer
        onSend={(body) => send(body)}
        allowRequest={false}
        placeholder="Escreva para a equipe da Boop"
        disabledText={archived ? "A conversa foi encerrada pela equipe. Fale com a Boop pelos outros canais." : null}
      />
    </section>
  )
}

/** Uma mensagem do fio: quem escreveu (a equipe com "Boop"), a hora, o tipo e, se houver, o post ou projeto. */
function PortalMessageRow({ item, href }: { item: PortalThreadItem; href: (path: string) => string }) {
  const { message, continued } = item
  const context = message.post
    ? { icon: Megaphone, label: message.post.title, path: `/portal/posts/${message.post.id}` }
    : message.project
      ? { icon: FolderKanban, label: message.project.name, path: `/portal/projetos/${message.project.id}` }
      : null

  return (
    <li className={cn("flex flex-col px-4", message.mine ? "items-end" : "items-start", continued ? "pt-1" : "pt-3")}>
      {continued ? null : (
        <p className="mb-0.5 text-[11px] text-muted-foreground">
          {message.mine ? "Você" : message.author_name}
          {message.from_team ? " · Boop" : ""} · {toTimeLabel(message.created_at)}
        </p>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5 break-words whitespace-pre-line text-foreground",
          message.mine ? "bg-brand-soft" : "bg-muted"
        )}
      >
        {message.kind === "change_request" || message.kind === "approval" ? (
          <span
            className={cn(
              "mb-1 block text-[11px] font-semibold",
              message.kind === "approval" ? "text-success-ink" : "text-warning-ink"
            )}
          >
            {MESSAGE_KIND_LABEL[message.kind]}
          </span>
        ) : null}
        {message.body}
        {context ? (
          <Link
            href={href(context.path)}
            className="mt-1.5 flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <context.icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{context.label}</span>
          </Link>
        ) : null}
      </div>
    </li>
  )
}
