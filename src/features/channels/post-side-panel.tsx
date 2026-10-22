"use client"

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { loadPostThread, markChannelRead, sendMessage } from "@/features/channels/actions"
import { Composer, type ComposerOptions } from "@/features/channels/composer"
import { buildThread, channelHref } from "@/features/channels/logic"
import { MessageItem, useReadReceipts } from "@/features/channels/message-item"
import { ThreadView } from "@/features/channels/thread-view"
import { searchMentions } from "@/features/mentions/actions"
import { useUnread } from "@/features/channels/unread-provider"
import { useThread } from "@/features/channels/use-thread"
import { useTasks } from "@/features/tasks/tasks-provider"
import { cn } from "@/lib/utils"

type Tab = "client" | "internal"

/**
 * Lateral do post: "Cliente" é o chat do post (o mesmo fio do canal do
 * cliente, só as mensagens deste post) e "Interno" é o histórico com os
 * comentários da equipe. O cliente lê a aba "Cliente" no portal; o campo só
 * libera depois de a conversa carregar (antes disso não há canal para enviar).
 */
export function PostSidePanel({ postId, internal, className }: { postId: string; internal: ReactNode; className?: string }) {
  const [tab, setTab] = useState<Tab>("client")
  const [channelId, setChannelId] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const { today } = useTasks()
  const unread = useUnread()
  const thread = useThread(postId, async (before) => {
    const result = await loadPostThread(postId, before)
    if (result.ok && !before) setChannelId(result.data.channelId)
    return result
  })
  const { seenBy, readers } = useReadReceipts(thread.messages, thread.reads)
  const days = buildThread(thread.messages ?? [], [], today)

  async function send(body: string, kind: "text" | "change_request" | "approval", options: ComposerOptions) {
    if (!channelId) return false
    const result = await sendMessage({ channel_id: channelId, body, kind, post_id: postId, internal: options.internal })
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
    // No celular (o post em tela cheia), o campo fica acima da barrinha de baixo do iPhone.
    <aside aria-label="Conversa do post" className={cn("flex min-h-0 flex-col max-md:pb-[var(--vv-safe-bottom,env(safe-area-inset-bottom))]", className)}>
      <div role="tablist" aria-label="Conversa" className="flex shrink-0 items-center gap-1 border-b px-3 pt-3">
        {(
          [
            ["client", "Cliente", thread.pending.length],
            ["internal", "Interno", 0],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              tab === value ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count > 0 ? (
              <span className="rounded-full bg-attention-muted px-1.5 text-[11px] font-medium text-attention-ink tabular-nums" title="Pedidos de ajuste pendentes">
                {count}
              </span>
            ) : null}
          </button>
        ))}
        {tab === "client" && channelId ? (
          <Link
            href={channelHref(channelId)}
            className="ml-auto flex items-center gap-1 pb-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Abrir o canal
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {tab === "client" ? (
        <>
          <ThreadView
            days={days}
            loaded={thread.messages !== null}
            error={thread.error}
            hasMore={thread.hasMore}
            onLoadOlder={thread.loadOlder}
            scrollToEndKey={sentCount}
            empty={
              <p className="px-6 py-12 text-center text-[13px] text-muted-foreground">
                Nenhuma mensagem sobre este post ainda. O que for escrito aqui vai para o canal do cliente, com o cartão
                do post, e o cliente lê quando o post chegar a ele.
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
                  showPost={false}
                  allowInternal
                  onChanged={thread.refresh}
                  onRemoved={thread.removeLocal}
                />
              ) : null
            }
          />
          <p className="shrink-0 border-t bg-attention-soft/60 px-4 py-2 text-xs text-attention-ink-strong max-md:py-1.5 max-md:text-[11.5px] max-md:leading-4">
            O cliente lê esta conversa (inclusive o que foi escrito antes). Para falar só com a equipe, marque Interno
            ao escrever (ou use a aba Interno).
          </p>
          <Composer
            onSend={send}
            allowRequest
            allowInternal
            placeholder="Escreva para o cliente sobre este post…"
            mentions={searchMentions}
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
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{internal}</div>
      )}
    </aside>
  )
}
