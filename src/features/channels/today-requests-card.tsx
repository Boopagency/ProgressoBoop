"use client"

import Link from "next/link"

import { channelHref, type PendingRequest } from "@/features/channels/logic"
import { useUnread } from "@/features/channels/unread-provider"
import { ClientMark } from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { daysBetween, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const VISIBLE = 5

function ageLabel(createdAt: string, today: DateKey): string {
  const days = daysBetween(toDateKey(createdAt), today)
  if (days <= 0) return "hoje"
  if (days === 1) return "ontem"
  return `há ${days} dias`
}

/**
 * Tela Hoje: os pedidos de ajuste pendentes (o mais antigo primeiro) e as
 * mensagens não lidas. Sem nada, não aparece.
 */
export function TodayRequestsCard({
  requests,
  today,
  className,
}: {
  requests: PendingRequest[]
  today: DateKey
  className?: string
}) {
  const { clientById } = useWorkspace()
  const { unread } = useUnread()
  if (requests.length === 0 && unread === 0) return null

  return (
    <section aria-labelledby="comunicacoes-hoje" className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
        <h2 id="comunicacoes-hoje" className="text-sm font-semibold text-foreground">
          Comunicações
        </h2>
        {unread > 0 ? (
          <Link href="/comunicacoes" className="ml-auto text-xs text-brand-ink tabular-nums hover:underline">
            {unread} {unread === 1 ? "não lida" : "não lidas"}
          </Link>
        ) : null}
      </header>
      {requests.length > 0 ? (
        <>
          <p className="px-4 text-xs font-medium text-warning-ink">
            {requests.length} {requests.length === 1 ? "pedido de ajuste pendente" : "pedidos de ajuste pendentes"}
          </p>
          <ul className="px-1 pt-1 pb-1">
            {requests.slice(0, VISIBLE).map((request) => {
              const clientId = request.channel.client_id
              const client = clientId ? clientById.get(clientId) : undefined
              return (
                <li key={request.id}>
                  <Link
                    href={channelHref(request.channel.id, "pendentes")}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
                  >
                    {clientId ? <ClientMark clientId={clientId} size="sm" className="mt-0.5" /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm break-words text-foreground">{request.body}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[client?.name ?? request.channel.name, request.post?.title, ageLabel(request.created_at, today)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="px-4 pb-2 text-xs text-muted-foreground">Nenhum pedido de ajuste pendente.</p>
      )}
      <Link href="/comunicacoes" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        {requests.length > VISIBLE ? `Ver todos (${requests.length}) em Comunicações` : "Abrir Comunicações"}
      </Link>
    </section>
  )
}
