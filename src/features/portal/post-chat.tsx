"use client"

import { SendHorizontal } from "lucide-react"
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { loadPortalMessages, sendPortalMessage } from "@/features/portal/content-actions"
import { loadPortalProjectMessages, sendPortalProjectMessage } from "@/features/portal/project-actions"
import { MESSAGE_MAX } from "@/features/portal/content-logic"
import type { PortalMessage } from "@/features/portal/content-queries"
import { formatShortDate, todayKey, toDateKey, toTimeLabel } from "@/lib/dates"
import { MESSAGE_KIND_LABEL } from "@/lib/labels"
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

/** Chat com a equipe: o mesmo fio do canal "Alterações" do cliente, só deste post ou projeto. */
export function PostChat({ target, initialMessages }: { target: ChatTarget; initialMessages: PortalMessage[] }) {
  const { kind, id } = target
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const listRef = useRef<HTMLOListElement>(null)
  const today = todayKey()

  useEffect(() => {
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
  }, [kind, id])

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
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <section aria-label={CHAT_COPY[kind].label} className="flex min-h-80 flex-col rounded-xl border bg-card md:max-h-[640px]">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Conversa com a equipe</h2>
        <p className="text-xs text-muted-foreground">{CHAT_COPY[kind].description}</p>
      </header>

      {messages.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-[13px] text-muted-foreground">
          {CHAT_COPY[kind].empty}
        </p>
      ) : (
        <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.map((message) => (
            <li key={message.id} className={cn("flex flex-col", message.mine ? "items-end" : "items-start")}>
              <p className="mb-0.5 text-[11px] text-muted-foreground">
                {message.mine ? "Você" : message.author_name}
                {message.from_team ? " · Boop" : ""} · {sentAt(message.created_at, today)}
              </p>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5 break-words whitespace-pre-line",
                  message.mine ? "bg-brand-soft text-foreground" : "bg-muted text-foreground"
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
                    {message.kind === "change_request" && message.resolved ? " · resolvido" : ""}
                  </span>
                ) : null}
                {message.body}
              </div>
            </li>
          ))}
        </ol>
      )}

      <form
        className="flex items-end gap-2 border-t p-3"
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
          className="max-h-40 min-h-9 resize-none"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" disabled={isPending || !draft.trim()} aria-label="Enviar">
          <SendHorizontal />
        </Button>
      </form>
    </section>
  )
}
