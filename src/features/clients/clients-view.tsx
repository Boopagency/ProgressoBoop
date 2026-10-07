"use client"

import { CalendarClock, ChevronDown, ListTodo, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PageContainer, PageHeader, SectionTitle } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ClientDialog, type ClientDialogState } from "@/features/clients/client-dialog"
import { HealthBadge, HealthDot, ReviewStateText } from "@/features/clients/client-meta"
import {
  clientTaskStats,
  currentHealth,
  monthName,
  periodOf,
  reviewStatus,
  upcomingClientEvents,
} from "@/features/clients/logic"
import { dayLabel } from "@/features/meetings/meeting-meta"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { EVENT_TYPE_LABEL } from "@/lib/labels"
import type { CalendarEvent, ClientDetail, ClientReview } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Lista de clientes: saúde, revisão do mês, tarefas e o próximo compromisso. */
export function ClientsView({
  clients,
  reviews,
  events,
}: {
  clients: ClientDetail[]
  reviews: ClientReview[]
  events: CalendarEvent[]
}) {
  const { today } = useTasks()
  const [dialog, setDialog] = useState<ClientDialogState>({ open: false, key: 0 })
  const [showInactive, setShowInactive] = useState(false)
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))

  const active = clients.filter((client) => client.active)
  const inactive = clients.filter((client) => !client.active)
  const statuses = active.map((client) => reviewStatus(client, reviews, today))
  const withReview = statuses.filter((status) => status.state !== "off")
  const doneCount = withReview.filter((status) => status.state === "done").length
  const overdueCount = withReview.filter((status) => status.state === "overdue").length
  const period = periodOf(today)

  return (
    <PageContainer className="max-w-[1180px]">
      <PageHeader
        title="Clientes"
        description="Quem a Boop atende: saúde, revisão do mês, tarefas e próximos compromissos."
        actions={
          <Button onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
            <Plus />
            Novo cliente
          </Button>
        }
      />

      {withReview.length > 0 ? (
        <section
          aria-labelledby="revisoes-do-mes"
          className="relative mt-8 overflow-hidden rounded-xl border bg-card px-5 py-4 pl-6"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="revisoes-do-mes" className="text-sm font-semibold text-foreground">
                Revisões de {monthName(period)}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {doneCount === withReview.length
                  ? "Todas feitas. Bom trabalho."
                  : `${withReview.length - doneCount} por fazer${overdueCount > 0 ? `, ${overdueCount} ${overdueCount === 1 ? "atrasada" : "atrasadas"}` : ""}.`}
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Progress
                value={(doneCount / withReview.length) * 100}
                aria-label="Revisões feitas"
                className="h-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {doneCount} de {withReview.length} {withReview.length === 1 ? "feita" : "feitas"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ativos" className="mt-8">
        <SectionTitle id="ativos" count={active.length}>
          Ativos
        </SectionTitle>
        {active.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nenhum cliente ativo</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Cadastre o primeiro em “Novo cliente”.</p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.map((client, index) => (
              <ClientCard key={client.id} client={client} reviews={reviews} events={events} status={statuses[index]!} />
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 ? (
        <section aria-labelledby="inativos" className="mt-10">
          <button
            type="button"
            aria-expanded={showInactive}
            onClick={() => setShowInactive((current) => !current)}
            className="flex items-center gap-2 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span id="inativos">Inativos</span>
            <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{inactive.length}</span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showInactive && "rotate-180")} />
          </button>
          {showInactive ? (
            <ul className="mt-2 -mx-3">
              {inactive.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clientes/${client.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <HealthDot health={null} />
                    {client.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <ClientDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PageContainer>
  )
}

function ClientCard({
  client,
  reviews,
  events,
  status,
}: {
  client: ClientDetail
  reviews: ClientReview[]
  events: CalendarEvent[]
  status: ReturnType<typeof reviewStatus>
}) {
  const { tasks, today } = useTasks()
  const { profiles } = useWorkspace()
  const health = currentHealth(client.id, reviews)
  const stats = clientTaskStats(tasks, client.id, today)
  const next = upcomingClientEvents(events, client.id, today)[0]
  const ownerIndex = profiles.findIndex((profile) => profile.id === client.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined

  return (
    <li>
      <Link
        href={`/clientes/${client.id}`}
        className="group flex h-full flex-col rounded-xl border bg-card px-4 py-4 transition-colors outline-none hover:border-foreground/15 hover:bg-muted/20 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[17px] leading-6 font-semibold tracking-tight text-foreground">
              {client.name}
            </span>
            <HealthBadge health={health?.health ?? null} className="mt-1.5" />
          </span>
          {owner ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {firstName(owner.full_name)}
              <PersonAvatar
                name={owner.full_name}
                avatarUrl={owner.avatar_url}
                colorIndex={ownerIndex}
                size="sm"
                className="size-6 [&_[data-slot=avatar-fallback]]:text-[10px]"
              />
            </span>
          ) : null}
        </span>

        {client.services.length > 0 ? (
          <span className="mt-3 flex flex-wrap gap-1">
            {client.services.slice(0, 3).map((service) => (
              <span key={service} className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {service}
              </span>
            ))}
            {client.services.length > 3 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                +{client.services.length - 3}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-4 space-y-1.5 border-t pt-3 text-[13px]">
          <span className="block">
            <ReviewStateText status={status} today={today} />
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ListTodo className="size-3.5 shrink-0" aria-hidden="true" />
            {stats.open === 0
              ? "Nenhuma tarefa aberta"
              : `${stats.open} ${stats.open === 1 ? "tarefa aberta" : "tarefas abertas"}`}
            {stats.overdue > 0 ? (
              <span className="font-medium text-overdue">
                · {stats.overdue} {stats.overdue === 1 ? "atrasada" : "atrasadas"}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            {next ? (
              <span className="truncate">
                {EVENT_TYPE_LABEL[next.event.event_type]} {dayLabel(next.date, today).toLocaleLowerCase("pt-BR")}
                {next.startTime ? `, ${next.startTime}` : ""}
              </span>
            ) : (
              "Nada marcado no calendário"
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
