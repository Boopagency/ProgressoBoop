"use client"

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { loadProjectThread, markChannelRead, sendMessage } from "@/features/channels/actions"
import { Composer, type ComposerOptions } from "@/features/channels/composer"
import { buildThread, channelHref } from "@/features/channels/logic"
import { MessageItem, useReadReceipts } from "@/features/channels/message-item"
import { ThreadView } from "@/features/channels/thread-view"
import { useUnread } from "@/features/channels/unread-provider"
import { useThread } from "@/features/channels/use-thread"
import { useTasks } from "@/features/tasks/tasks-provider"
import { cn } from "@/lib/utils"

/**
 * Conversa do projeto com o cliente: o mesmo fio do canal do cliente, só as
 * mensagens marcadas com este projeto. O cliente lê e responde na página do
 * projeto no portal. O campo só libera depois de a conversa carregar.
 */
export function ProjectClientChat({ projectId, className }: { projectId: string; className?: string }) {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const { today } = useTasks()
  const unread = useUnread()
  const thread = useThread(projectId, async (before) => {
    const result = await loadProjectThread(projectId, before)
    if (result.ok && !before) setChannelId(result.data.channelId)
    return result
  })
  const { seenBy, readers } = useReadReceipts(thread.messages, thread.reads)
  const days = buildThread(thread.messages ?? [], [], today)

  async function send(body: string, kind: "text" | "change_request" | "approval", options: ComposerOptions) {
    if (!channelId) return false
    const result = await sendMessage({
      channel_id: channelId,
      body,
      kind,
      post_id: null,
      project_id: projectId,
      internal: options.internal,
    })
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    thread.addLocal(result.data)
    // Quem responde viu a conversa: o canal fica lido até a resposta.
    void markChannelRead(result.data.channel_id, result.data.created_at).then((read) => {
      if (read.ok) unread.refresh()
    })
    setSentCount((value) => value + 1)
    return true
  }

  return (
    <section
      aria-labelledby="conversa-projeto"
      className={cn("flex h-[520px] min-h-0 flex-col overflow-hidden rounded-xl border bg-card", className)}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h2 id="conversa-projeto" className="text-sm font-semibold text-foreground">
          Conversa com o cliente
        </h2>
        {thread.pending.length > 0 ? (
          <span
            className="rounded-full bg-attention-muted px-1.5 text-[11px] font-medium text-attention-ink tabular-nums"
            title="Pedidos de ajuste pendentes"
          >
            {thread.pending.length}
          </span>
        ) : null}
        {channelId ? (
          <Link
            href={channelHref(channelId)}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Abrir o canal
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      <ThreadView
        days={days}
        loaded={thread.messages !== null}
        error={thread.error}
        hasMore={thread.hasMore}
        onLoadOlder={thread.loadOlder}
        scrollToEndKey={sentCount}
        empty={
          <p className="px-6 py-12 text-center text-[13px] text-muted-foreground">
            Nenhuma mensagem sobre este projeto ainda. O que for escrito aqui vai para o canal do cliente, marcado com o
            projeto, e o cliente lê na página do projeto no portal.
          </p>
        }
        renderItem={(item) =>
          item.type === "message" ? (
            <MessageItem
              key={item.key}
              message={item.message}
              seenBy={seenBy.get(item.message.id)}
              readers={readers.get(item.message.id)}
              continued={item.continued}
              showProject={false}
              allowInternal
              onChanged={thread.refresh}
              onRemoved={thread.removeLocal}
            />
          ) : null
        }
      />
      <p className="shrink-0 border-t bg-attention-soft/60 px-4 py-2 text-xs text-attention-ink-strong max-md:py-1.5 max-md:text-[11.5px] max-md:leading-4">
        O cliente lê esta conversa no portal (inclusive o que foi escrito antes). Para falar só com a equipe, marque
        Interno ao escrever.
      </p>
      <Composer
        onSend={send}
        allowRequest
        allowInternal
        placeholder="Escreva para o cliente sobre este projeto…"
        disabledText={
          thread.messages === null
            ? thread.error
              ? "Não foi possível carregar a conversa."
              : "Carregando a conversa…"
            : !channelId
              ? "Este cliente ainda não tem canal."
              : null
        }
        className="border-t-0"
      />
    </section>
  )
}
