"use client"

import { ArrowUpRight, Building2, CalendarClock, ChevronDown, ListTodo, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PageBody, PageContainer, PageHeader, SectionTitle } from "@/components/layout/page"
import { EmptyPanel } from "@/components/empty-panel"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ClientDialog, type ClientDialogState } from "@/features/clients/client-dialog"
import { HealthBadge, HealthDot, ReviewStateText } from "@/features/clients/client-meta"
import { ClientMark } from "@/features/content/post-meta"
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
    <PageContainer>
      <PageHeader
        title={
          <>
            Carteira de <em>clientes</em>
          </>
        }
        description="Quem a Boop atende: saúde, revisão do mês, tarefas e próximos compromissos."
        actions={
          <Button onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
            <Plus />
            Novo cliente
          </Button>
        }
      />

      <PageBody>
        {withReview.length > 0 ? (
          <section
            aria-labelledby="revisoes-do-mes"
            className="relative overflow-hidden rounded-3xl border bg-card px-5 py-5 sm:px-7 sm:py-6"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-glow-soft blur-3xl"
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 id="revisoes-do-mes" className="flex items-center gap-1.5 eyebrow text-muted-foreground">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_8px_var(--glow)]" />
                  Revisões de {monthName(period)}
                </h2>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="display-number text-[56px] leading-[0.85] text-foreground">{doneCount}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    de {withReview.length} {withReview.length === 1 ? "feita" : "feitas"}
                  </span>
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {doneCount === withReview.length ? (
                    "Todas feitas. Bom trabalho."
                  ) : (
                    <>
                      {withReview.length - doneCount} por fazer
                      {overdueCount > 0 ? (
                        <span className="font-medium text-overdue">
                          , {overdueCount} {overdueCount === 1 ? "atrasada" : "atrasadas"}
                        </span>
                      ) : null}
                      .
                    </>
                  )}
                </p>
              </div>
              <div className="w-full sm:w-72">
                <Progress
                  value={(doneCount / withReview.length) * 100}
                  aria-label="Revisões feitas"
                  className="h-2"
                />
                <p className="mt-2 text-right text-xs text-muted-foreground tabular-nums">
                  {Math.round((doneCount / withReview.length) * 100)}% do mês
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="ativos">
          <SectionTitle id="ativos" count={active.length}>
            Ativos
          </SectionTitle>
          {active.length === 0 ? (
            <EmptyPanel
              icon={Building2}
              title="Nenhum cliente ativo"
              className="mt-3"
              action={
                <Button onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
                  <Plus />
                  Novo cliente
                </Button>
              }
            >
              Cadastre o primeiro em “Novo cliente”: saúde, revisão do mês e tarefas aparecem aqui.
            </EmptyPanel>
          ) : (
            <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map((client, index) => (
                <ClientCard key={client.id} client={client} reviews={reviews} events={events} status={statuses[index]!} />
              ))}
            </ul>
          )}
        </section>

        {inactive.length > 0 ? (
          <section aria-labelledby="inativos">
            <button
              type="button"
              aria-expanded={showInactive}
              onClick={() => setShowInactive((current) => !current)}
              className="flex min-h-9 items-center gap-2 rounded-full text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span id="inativos">Inativos</span>
              <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{inactive.length}</span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showInactive && "rotate-180")} />
            </button>
            {showInactive ? (
              <ul className="mt-2 rounded-3xl border bg-card p-1.5">
                {inactive.map((client) => (
                  <li key={client.id}>
                    <Link
                      href={`/clientes/${client.id}`}
                      className="flex min-h-10 items-center gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
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
      </PageBody>

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
        className="group relative flex h-full flex-col rounded-3xl border bg-card px-5 py-5 transition-[border-color,box-shadow] duration-150 outline-none hover:border-glow/40 hover:shadow-float focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <ArrowUpRight
          aria-hidden="true"
          className="absolute top-5 right-5 size-4 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
        <span className="flex items-start gap-3">
          <ClientMark clientId={client.id} size="lg" className="shadow-[0_0_0_1px_var(--glass-edge)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg leading-6 font-medium tracking-tight text-foreground">
              {client.name}
            </span>
            <HealthBadge health={health?.health ?? null} className="mt-1.5" />
          </span>
          {owner ? (
            <span className="mr-6 flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
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
              <span key={service} className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-[11.5px] text-muted-foreground">
                {service}
              </span>
            ))}
            {client.services.length > 3 ? (
              <span className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-[11.5px] text-muted-foreground">
                +{client.services.length - 3}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-auto block pt-4">
          <span className="block space-y-1.5 border-t pt-3 text-[13px]">
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
        </span>
      </Link>
    </li>
  )
}
