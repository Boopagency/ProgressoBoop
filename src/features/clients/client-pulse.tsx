"use client"

import Link from "next/link"

import { HealthDot, ReviewStateText } from "@/features/clients/client-meta"
import {
  clientTaskStats,
  currentHealth,
  monthName,
  periodOf,
  reviewStatus,
  reviewsToDo,
} from "@/features/clients/logic"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { ClientDetail, ClientReview } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Revisões mensais por fazer (tela Hoje): atrasadas primeiro. Some quando
 * está tudo em dia.
 */
export function ReviewsDueCard({
  clients,
  reviews,
  className,
}: {
  clients: ClientDetail[]
  reviews: ClientReview[]
  className?: string
}) {
  const { today } = useTasks()
  const { profileById } = useWorkspace()
  const items = reviewsToDo(clients, reviews, today)
  if (items.length === 0) return null

  return (
    <section aria-labelledby="revisoes-pendentes" className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
        <h2 id="revisoes-pendentes" className="text-sm font-semibold text-foreground">
          Revisões de clientes
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">{monthName(periodOf(today))}</span>
      </header>
      <ul className="px-1 pb-2">
        {items.map(({ client, status }) => {
          const owner = client.owner_id ? profileById.get(client.owner_id) : undefined
          return (
            <li key={client.id}>
              <Link
                href={`/clientes/${client.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
              >
                <HealthDot health={currentHealth(client.id, reviews)?.health ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{client.name}</span>
                  <ReviewStateText status={status} today={today} withMonth={false} className="text-xs" />
                </span>
                {owner ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{firstName(owner.full_name)}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Clientes na weekly: saúde, revisão do mês e tarefas abertas de cada cliente
 * ativo com revisão mensal. É sempre o estado de agora (não fica guardado ao
 * encerrar).
 */
export function ClientsPulseCard({
  clients,
  reviews,
  className,
}: {
  clients: ClientDetail[]
  reviews: ClientReview[]
  className?: string
}) {
  const { tasks, today } = useTasks()
  // Só quem passa por revisão mensal (a Boop, interna, fica de fora).
  const active = clients.filter((client) => client.active && client.review_day !== null)
  if (active.length === 0) return null

  return (
    <section aria-labelledby="clientes-agora" className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex items-baseline gap-2 border-b px-4 py-3.5">
        <h2 id="clientes-agora" className="text-sm font-semibold text-foreground">
          Clientes
        </h2>
        <span className="text-xs text-muted-foreground">saúde e revisão de {monthName(periodOf(today))}, agora</span>
      </header>
      <ul className="divide-y">
        {active.map((client) => {
          const status = reviewStatus(client, reviews, today)
          const stats = clientTaskStats(tasks, client.id, today)
          return (
            <li key={client.id}>
              <Link
                href={`/clientes/${client.id}`}
                className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <HealthDot health={currentHealth(client.id, reviews)?.health ?? null} />
                  <span className="truncate text-sm font-medium text-foreground">{client.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 pl-5 text-xs text-muted-foreground sm:pl-0">
                  <ReviewStateText status={status} today={today} withMonth={false} />
                  <span className="tabular-nums">
                    {stats.open} {stats.open === 1 ? "tarefa" : "tarefas"}
                    {stats.overdue > 0 ? (
                      <span className="font-medium text-overdue"> · {stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}</span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
