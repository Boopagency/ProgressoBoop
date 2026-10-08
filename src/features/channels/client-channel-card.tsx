"use client"

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { PanelCard } from "@/components/panel-card"
import { loadClientChannel, type ClientChannelSummary } from "@/features/channels/actions"
import { channelHref, type ThreadMessage } from "@/features/channels/logic"
import { RequestStatus, useAuthor } from "@/features/channels/message-item"
import { formatShortDate, toDateKey, toTimeLabel, todayKey } from "@/lib/dates"

function MessageLine({ message, today }: { message: ThreadMessage; today: string }) {
  const author = useAuthor(message.author_id)
  const day = toDateKey(message.created_at)
  return (
    <li className="px-4 py-2.5">
      <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{author.name}</span>
        <span className="tabular-nums">{day === today ? toTimeLabel(message.created_at) : formatShortDate(day, today)}</span>
        {message.post ? <span className="truncate">· {message.post.title}</span> : null}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 break-words whitespace-pre-line text-foreground">{message.body}</p>
      {message.kind === "change_request" ? <RequestStatus message={message} className="mt-1" /> : null}
    </li>
  )
}

/**
 * Página do cliente: o canal "Alterações" dele, com os pedidos pendentes e
 * as últimas mensagens. Carrega sozinho ao abrir a página.
 */
export function ClientChannelCard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ClientChannelSummary | null | undefined>(undefined)
  const [today] = useState(() => todayKey())

  useEffect(() => {
    let current = true
    void loadClientChannel(clientId).then((result) => {
      if (current) setData(result.ok ? result.data : null)
    })
    return () => {
      current = false
    }
  }, [clientId])

  if (data === null) return null
  const shownPending = data?.pending.slice(0, 3) ?? []
  // As últimas mensagens, sem repetir os pendentes que já aparecem em cima.
  const recent = data?.recent.filter((message) => !shownPending.some((pending) => pending.id === message.id)) ?? []

  return (
    <PanelCard
      id="canal-cliente"
      title={
        <>
          Canal do cliente
          {data && data.pending.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800 tabular-nums">
              {data.pending.length} {data.pending.length === 1 ? "pendente" : "pendentes"}
            </span>
          ) : null}
        </>
      }
      action={
        data ? (
          <Link
            href={channelHref(data.channelId)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Abrir
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {data === undefined ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Carregando…</p>
      ) : data.recent.length === 0 && data.pending.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Nenhuma mensagem ainda. Pedidos de ajuste e o chat dos posts deste cliente ficam no canal “{data.name}”.
        </p>
      ) : (
        <>
          {data.pending.length > 0 ? (
            <div className="border-b">
              <p className="px-4 pt-2.5 text-xs font-medium text-warning-ink">Pedidos de ajuste pendentes</p>
              <ul className="divide-y">
                {shownPending.map((message) => (
                  <MessageLine key={message.id} message={message} today={today} />
                ))}
              </ul>
              {data.pending.length > 3 ? (
                <Link
                  href={channelHref(data.channelId, "pendentes")}
                  className="block px-4 pb-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Ver os {data.pending.length} pendentes
                </Link>
              ) : null}
            </div>
          ) : null}
          {recent.length > 0 ? (
            <>
              <p className="px-4 pt-2.5 text-xs font-medium text-muted-foreground">Últimas mensagens</p>
              <ul className="divide-y">
                {recent.map((message) => (
                  <MessageLine key={message.id} message={message} today={today} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </PanelCard>
  )
}
