"use client"

import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  FilePlus2,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Power,
  Trash2,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PageContainer } from "@/components/layout/page"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EventDialog, type EventDialogState } from "@/features/calendar/event-dialog"
import { deleteClient, setClientActive } from "@/features/clients/actions"
import { ClientDialog, type ClientDialogState } from "@/features/clients/client-dialog"
import { HealthBadge, HealthDot } from "@/features/clients/client-meta"
import { currentHealth, healthHistory, monthName, periodParam } from "@/features/clients/logic"
import { ReviewCard } from "@/features/clients/review-card"
import { CommunicationsCard } from "@/features/communications/communications-card"
import { ClientContentCard } from "@/features/content/client-content-card"
import { ClientIdeasCard } from "@/features/content/client-ideas-card"
import type { PostSummary } from "@/features/content/logic"
import { DecisionsCard } from "@/features/decisions/decisions-card"
import { ClientDocsCard } from "@/features/docs/client-docs-card"
import { NewDocDialog, type NewDocDialogState } from "@/features/docs/new-doc-dialog"
import type { TemplateId } from "@/features/docs/templates"
import { meetingsOverview, type MeetingEntry } from "@/features/meetings/logic"
import { EntryStateBadge, dayLabel, entryState, timeLabel } from "@/features/meetings/meeting-meta"
import { ClientDealsCard } from "@/features/deals/client-deals-card"
import { ClientFinanceCard } from "@/features/finance/finance-cards"
import type { FinanceData } from "@/features/finance/management"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { ClientProjectsCard } from "@/features/projects/client-projects-card"
import { dayContext, firstName, groupTasks, TASK_GROUP_LABEL, type TaskGroupKey } from "@/features/tasks/logic"
import { useNewTask } from "@/features/tasks/new-task-dialog"
import { TaskRow } from "@/features/tasks/task-row"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { addDaysToKey, formatMonthYear, toDateKey } from "@/lib/dates"
import { CLIENT_HEALTH_LABEL } from "@/lib/labels"
import type {
  CalendarEvent,
  ClientDetail,
  ClientReview,
  Communication,
  ContentIdea,
  DateKey,
  Decision,
  Deal,
  DocSummary,
  MeetingRecord,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function ClientView({
  client,
  reviews,
  period,
  events,
  records,
  docs,
  templateDocs,
  communications,
  decisions,
  finance,
  deals,
  posts,
  ideas,
}: {
  client: ClientDetail
  reviews: ClientReview[]
  /** Mês da revisão aberta (dia 1). */
  period: DateKey
  events: CalendarEvent[]
  records: MeetingRecord[]
  /** Processos do cliente. */
  docs: DocSummary[]
  /** Todos os processos (modelos de checklist para um projeto novo). */
  templateDocs: DocSummary[]
  communications: Communication[]
  decisions: Decision[]
  finance: FinanceData
  deals: Deal[]
  /** Posts do cliente (Central de Conteúdo). */
  posts: PostSummary[]
  /** Banco de ideias do cliente. */
  ideas: ContentIdea[]
}) {
  const router = useRouter()
  const { today } = useTasks()
  const { openNewTask } = useNewTask()
  const { profiles } = useWorkspace()
  const [clientDialog, setClientDialog] = useState<ClientDialogState>({ open: false, key: 0 })
  const [eventDialog, setEventDialog] = useState<EventDialogState>({ open: false, key: 0, mode: "meeting" })
  const [docDialog, setDocDialog] = useState<NewDocDialogState>({ open: false, key: 0 })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const health = currentHealth(client.id, reviews)
  const ownerIndex = profiles.findIndex((profile) => profile.id === client.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined

  function openNewDoc(template?: TemplateId) {
    setDocDialog((current) => ({
      open: true,
      key: current.key + 1,
      defaults: { client_id: client.id, area: "clients", template },
    }))
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setClientActive(client.id, !client.active)
      if (!result.ok) toast.error(result.error)
      else toast.success(client.active ? "Cliente desativado" : "Cliente reativado", { description: client.name })
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteClient(client.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmDelete(false)
      toast("Cliente excluído", { description: client.name })
      router.push("/clientes")
    })
  }

  return (
    <PageContainer className="max-w-[1240px]">
      <nav aria-label="Navegação" className="text-[13px]">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Clientes
        </Link>
      </nav>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <HealthBadge health={health?.health ?? null} />
            {!client.active ? (
              <span className="inline-flex h-5 items-center rounded-full border border-dashed px-2 text-[11.5px] font-medium text-muted-foreground">
                Inativo
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-9">
            {client.name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            {[
              owner ? `Responsável: ${firstName(owner.full_name)}` : null,
              client.since ? `Cliente desde ${formatMonthYear(client.since).toLocaleLowerCase("pt-BR")}` : null,
              client.services.length > 0 ? client.services.join(", ") : null,
            ]
              .filter(Boolean)
              .map((part, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden="true" className="text-subtle-foreground">·</span> : null}
                  {part}
                </span>
              ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => openNewTask({ client_id: client.id, area: "clients" })}
            className="gap-1.5 shadow-none"
          >
            <Plus />
            Tarefa
          </Button>
          <Button
            variant="outline"
            onClick={() => setClientDialog((current) => ({ open: true, key: current.key + 1, client }))}
            className="gap-1.5 shadow-none"
          >
            <Pencil />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mais ações">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() =>
                  setEventDialog((current) => ({ open: true, key: current.key + 1, mode: "meeting", clientId: client.id }))
                }
              >
                <CalendarPlus />
                Nova reunião
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openNewDoc()}>
                <FilePlus2 />
                Novo documento do cliente
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={toggleActive} disabled={isPending}>
                <Power />
                {client.active ? "Desativar cliente" : "Reativar cliente"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                Excluir…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-x-10">
        <div className="min-w-0 space-y-6">
          <ReviewCard key={`${client.id}:${period}`} client={client} period={period} reviews={reviews} />
          <ClientProjectsCard clientId={client.id} docs={templateDocs} />
          <ClientContentCard clientId={client.id} posts={posts} today={today} />
          <ClientIdeasCard clientId={client.id} ideas={ideas} posts={posts} />
          <ClientDocsCard docs={docs} today={today} onNew={openNewDoc} />
          <ClientTasksCard clientId={client.id} />
          <CommunicationsCard communications={communications} defaults={{ client_id: client.id }} showProject />
          <ClientMeetingsCard client={client} events={events} records={records} onNew={() =>
            setEventDialog((current) => ({ open: true, key: current.key + 1, mode: "meeting", clientId: client.id }))
          } />
        </div>
        <aside aria-label="Sobre o cliente" className="min-w-0 space-y-6">
          <AboutCard client={client} />
          <ClientFinanceCard clientId={client.id} finance={finance} today={today} />
          <ClientDealsCard clientId={client.id} deals={deals} today={today} />
          <HealthHistoryCard clientId={client.id} reviews={reviews} period={period} />
          <DecisionsCard
            decisions={decisions}
            defaults={{ client_id: client.id, area: "clients" }}
            emptyText="Combinados de preço, escopo ou prazo com este cliente ficam aqui."
          />
        </aside>
      </div>

      <ClientDialog state={clientDialog} onOpenChange={(open) => setClientDialog((current) => ({ ...current, open }))} />
      <EventDialog
        state={eventDialog}
        today={today}
        onOpenChange={(open) => setEventDialog((current) => ({ ...current, open }))}
      />
      <NewDocDialog state={docDialog} onOpenChange={(open) => setDocDialog((current) => ({ ...current, open }))} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro, as revisões mensais, as comunicações, os posts (com as imagens) e as ideias de conteúdo serão apagados.
              Tarefas, projetos, eventos, processos, decisões e lançamentos continuam, sem o cliente. Para só
              tirar das listas, use “Desativar cliente”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? "Excluindo…" : "Excluir cliente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Cartões                                                             */
/* ------------------------------------------------------------------ */

function Card({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
        </h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

const OPEN_GROUPS: TaskGroupKey[] = ["overdue", "today", "week", "later", "undated"]

function ClientTasksCard({ clientId }: { clientId: string }) {
  const { tasks, today, keepInPlace } = useTasks()
  const [showDone, setShowDone] = useState(false)
  const groups = groupTasks(
    tasks.filter((task) => task.client_id === clientId),
    dayContext(today),
    keepInPlace
  )
  const since = addDaysToKey(today, -30)
  const recentDone = groups.done.filter((task) => task.completed_at && toDateKey(task.completed_at) >= since)
  const openCount = OPEN_GROUPS.reduce((total, key) => total + groups[key].length, 0)

  return (
    <Card
      id="tarefas-cliente"
      title={
        <>
          Tarefas
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{openCount}</span>
        </>
      }
    >
      {openCount === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Nenhuma tarefa aberta para este cliente.</p>
      ) : (
        <div className="py-1">
          {OPEN_GROUPS.filter((key) => groups[key].length > 0).map((key) => (
            <div key={key}>
              <p
                className={cn(
                  "px-4 pt-2.5 pb-0.5 text-xs font-medium",
                  key === "overdue" ? "text-overdue" : "text-muted-foreground"
                )}
              >
                {TASK_GROUP_LABEL[key]} · {groups[key].length}
              </p>
              <div role="list" className="px-1">
                {groups[key].map((task) => (
                  <TaskRow key={task.id} task={task} showAssignees />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {recentDone.length > 0 ? (
        <div className="border-t">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((current) => !current)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Concluídas nos últimos 30 dias · {recentDone.length}
            <ChevronDown className={cn("size-3.5 transition-transform", showDone && "rotate-180")} />
          </button>
          {showDone ? (
            <div role="list" className="px-1 pb-1">
              {recentDone.map((task) => (
                <TaskRow key={task.id} task={task} showAssignees />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function MeetingRowLink({ entry, today }: { entry: MeetingEntry; today: DateKey }) {
  const state = entryState(entry, today)
  return (
    <li>
      <MeetingLink
        meetingId={entry.record?.id ?? null}
        eventId={entry.event.id}
        date={entry.date}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{entry.event.title}</span>
          <span className="block text-[13px] text-muted-foreground tabular-nums">
            {dayLabel(entry.date, today)} · {timeLabel(entry)}
          </span>
        </span>
        {state === "upcoming" ? null : <EntryStateBadge state={state} />}
      </MeetingLink>
    </li>
  )
}

function ClientMeetingsCard({
  client,
  events,
  records,
  onNew,
}: {
  client: ClientDetail
  events: CalendarEvent[]
  records: MeetingRecord[]
  onNew: () => void
}) {
  const { today } = useTasks()
  const overview = meetingsOverview(
    events.filter((event) => event.client_id === client.id),
    records,
    today,
    { horizonDays: 60, lookbackDays: 60 }
  )
  const upcoming = overview.upcoming.slice(0, 3)
  const history = overview.history.slice(0, 4)

  return (
    <Card
      id="reunioes-cliente"
      title="Reuniões"
      action={
        <Button variant="ghost" size="sm" onClick={onNew} className="h-7 gap-1 px-2 text-xs">
          <CalendarPlus className="size-3.5" />
          Nova reunião
        </Button>
      }
    >
      {upcoming.length === 0 && history.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Nenhuma reunião com {client.name} nos últimos dois meses nem marcada.
        </p>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <div>
              <p className="px-4 pt-2.5 text-xs font-medium text-muted-foreground">Próximas</p>
              <ul>
                {upcoming.map((entry) => (
                  <MeetingRowLink key={entry.key} entry={entry} today={today} />
                ))}
              </ul>
            </div>
          ) : null}
          {history.length > 0 ? (
            <div className={cn(upcoming.length > 0 && "border-t")}>
              <p className="px-4 pt-2.5 text-xs font-medium text-muted-foreground">Recentes</p>
              <ul>
                {history.map((entry) => (
                  <MeetingRowLink key={entry.key} entry={entry} today={today} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

function AboutCard({ client }: { client: ClientDetail }) {
  const { profiles } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === client.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  const hasContact = client.contact_name || client.contact_email || client.contact_phone
  const phoneDigits = client.contact_phone?.replace(/\D/g, "") ?? ""

  return (
    <Card id="sobre-cliente" title="Sobre o cliente">
      <dl className="space-y-3 px-4 py-4 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Responsável</dt>
          <dd className="flex items-center gap-1.5 text-foreground">
            {owner ? (
              <>
                <PersonAvatar
                  name={owner.full_name}
                  avatarUrl={owner.avatar_url}
                  colorIndex={ownerIndex}
                  size="sm"
                  className="size-5 [&_[data-slot=avatar-fallback]]:text-[9px]"
                />
                {firstName(owner.full_name)}
              </>
            ) : (
              <span className="text-muted-foreground">Ninguém em especial</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Revisão</dt>
          <dd className="text-foreground">
            {client.review_day ? `todo dia ${client.review_day}` : "sem revisão mensal"}
          </dd>
        </div>
        {client.services.length > 0 ? (
          <div>
            <dt className="text-muted-foreground">Frentes</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {client.services.map((service) => (
                <span key={service} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                  {service}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Contato</dt>
          <dd className="mt-1 space-y-1 text-foreground">
            {hasContact ? (
              <>
                {client.contact_name ? (
                  <p className="flex items-center gap-1.5">
                    <UserRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {client.contact_name}
                  </p>
                ) : null}
                {client.contact_email ? (
                  <p className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <a href={`mailto:${client.contact_email}`} className="truncate hover:text-brand-ink hover:underline">
                      {client.contact_email}
                    </a>
                  </p>
                ) : null}
                {client.contact_phone ? (
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <a
                      href={phoneDigits.length >= 10 ? `https://wa.me/${phoneDigits.length <= 11 ? `55${phoneDigits}` : phoneDigits}` : `tel:${client.contact_phone}`}
                      target={phoneDigits.length >= 10 ? "_blank" : undefined}
                      rel="noreferrer"
                      className="hover:text-brand-ink hover:underline"
                    >
                      {client.contact_phone}
                    </a>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Sem contato cadastrado.</p>
            )}
          </dd>
        </div>
        {client.notes ? (
          <div>
            <dt className="text-muted-foreground">Observações</dt>
            <dd className="mt-1 text-[13px] leading-5 whitespace-pre-line text-foreground">{client.notes}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  )
}

function HealthHistoryCard({
  clientId,
  reviews,
  period,
}: {
  clientId: string
  reviews: ClientReview[]
  period: DateKey
}) {
  const { today } = useTasks()
  const history = healthHistory(clientId, reviews, today, 6)
  return (
    <Card id="historico-saude" title="Saúde mês a mês">
      <ul className="py-1.5">
        {history.map(({ period: month, review }) => (
          <li key={month}>
            <Link
              href={`?mes=${periodParam(month)}`}
              scroll={false}
              aria-current={month === period ? "true" : undefined}
              className={cn(
                "flex items-center gap-3 px-4 py-1.5 text-[13px] transition-colors hover:bg-muted/50",
                month === period && "bg-accent/60"
              )}
            >
              <HealthDot health={review?.health ?? null} />
              <span className="flex-1 text-foreground first-letter:uppercase">{monthName(month)}</span>
              <span className="text-xs text-muted-foreground">
                {review?.health ? CLIENT_HEALTH_LABEL[review.health] : review ? "Sem avaliação" : "Sem revisão"}
                {review?.done ? " · feita" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
