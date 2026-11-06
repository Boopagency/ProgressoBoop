"use client"

import { MessageCircle, SendHorizontal } from "lucide-react"
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { toast } from "sonner"

import { BoopMark } from "@/components/layout/boop-mark"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { loadPortalMessages, sendPortalMessage } from "@/features/portal/content-actions"
import { loadPortalProjectMessages, sendPortalProjectMessage } from "@/features/portal/project-actions"
import { MESSAGE_MAX } from "@/features/portal/content-logic"
import type { PortalMessage } from "@/features/portal/content-queries"
import { PortalMessageBubble } from "@/features/portal/message-bubble"
import { formatShortDate, todayKey, toDateKey, toTimeLabel } from "@/lib/dates"
import { cn } from "@/lib/utils"

/** De quanto em quanto tempo o chat busca mensagens novas (só com a aba visível). */
const POLL_MS = 10000

function sentAt(instant: string, today: string): string {
  const day = toDateKey(instant)
  const time = toTimeLabel(instant)
  return day === today ? time : `${formatShortDate(day, today)} · ${time}`
}

/** De que é a conversa: um post ou um projeto (os dois ficam no canal "Alterações" do cliente). */
export type ChatTarget = { kind: "post" | "project"; id: string }

const CHAT_COPY = {
  post: {
    label: "Conversa sobre o post",
    description: "Dúvidas e pedidos sobre este post.",
    empty: "Nenhuma mensagem ainda. Escreva aqui se tiver alguma dúvida sobre o post.",
  },
  project: {
    label: "Conversa sobre o projeto",
    description: "Dúvidas, pedidos e materiais sobre este projeto.",
    empty: "Nenhuma mensagem ainda. Escreva aqui se tiver alguma dúvida sobre o projeto.",
  },
} as const

function loadMessages(target: ChatTarget) {
  return target.kind === "post" ? loadPortalMessages(target.id) : loadPortalProjectMessages(target.id)
}

function sendMessage(target: ChatTarget, body: string) {
  return target.kind === "post" ? sendPortalMessage(target.id, body) : sendPortalProjectMessage(target.id, body)
}

/**
 * Chat com a equipe: o mesmo fio do canal "Alterações" do cliente, só deste
 * post ou projeto. `live={false}` não busca mensagens novas (a vitrine).
 */
export function PostChat({
  target,
  initialMessages,
  live = true,
  className,
}: {
  target: ChatTarget
  initialMessages: PortalMessage[]
  live?: boolean
  className?: string
}) {
  const { kind, id } = target
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const listRef = useRef<HTMLOListElement>(null)
  const today = todayKey()

  useEffect(() => {
    if (!live) return
    let active = true
    async function poll() {
      if (document.visibilityState !== "visible") return
      const result = await loadMessages({ kind, id }).catch(() => null)
      if (active && result?.ok) setMessages(result.data)
    }
    const timer = window.setInterval(poll, POLL_MS)
    document.addEventListener("visibilitychange", poll)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [kind, id, live])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  function send() {
    const body = draft.trim()
    if (!body || isPending) return
    startTransition(async () => {
      const result = await sendMessage(target, body)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDraft("")
      const latest = await loadMessages(target).catch(() => null)
      if (latest?.ok) setMessages(latest.data)
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // No celular (toque) não há Shift: Enter quebra a linha e o botão envia.
    if (window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches) return
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <section
      aria-label={CHAT_COPY[kind].label}
      className={cn("flex min-h-96 flex-col overflow-hidden rounded-[1.75rem] border bg-card md:max-h-[680px]", className)}
    >
      <header className="flex items-center gap-3 border-b px-5 py-4">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-glow/25 bg-glow-soft">
          <BoopMark className="w-[62%]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Conversa com a equipe</h2>
          <p className="truncate text-xs text-muted-foreground">{CHAT_COPY[kind].description}</p>
        </div>
      </header>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
          <MessageCircle className="size-6 text-brand-ink" aria-hidden="true" />
          <p className="mt-3 max-w-xs text-[13.5px] leading-5 text-muted-foreground">{CHAT_COPY[kind].empty}</p>
        </div>
      ) : (
        <ol ref={listRef} className="flex-1 overflow-y-auto pt-1 pb-4 max-md:bg-muted/40" aria-live="polite">
          {messages.map((message) => (
            <PortalMessageBubble key={message.id} message={message} time={sentAt(message.created_at, today)} />
          ))}
        </ol>
      )}

      <form
        className="flex items-end gap-2 border-t p-3 sm:px-4"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem para a equipe"
          maxLength={MESSAGE_MAX}
          rows={1}
          className="max-h-40 min-h-10 resize-none rounded-[1.25rem] px-4"
        />
        <Button type="submit" size="icon" className="size-10 shrink-0" disabled={isPending || !draft.trim()} aria-label="Enviar">
          <SendHorizontal />
        </Button>
      </form>
    </section>
  )
}
