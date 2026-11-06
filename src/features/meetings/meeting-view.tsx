"use client"

import {
  Ban,
  CalendarCog,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageBody, PageContainer, PageHeader, PageMeta } from "@/components/layout/page"
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
import { ClientsPulseCard } from "@/features/clients/client-pulse"
import { DecisionsCard } from "@/features/decisions/decisions-card"
import { deleteMeeting, setMeetingStatus } from "@/features/meetings/actions"
import { FrozenNote, PreviousAgreementsCard, TasksAgendaCard, type AgendaSource } from "@/features/meetings/agenda-panel"
import { AgreementsCard } from "@/features/meetings/agreements"
import {
  agreementStatus,
  buildAgenda,
  meetingKind,
  type Agenda,
  type MeetingEntry,
} from "@/features/meetings/logic"
import { EntryStateBadge, MeetingKindBadge, entryState, relativeDays, timeLabel } from "@/features/meetings/meeting-meta"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { SummaryCard } from "@/features/meetings/summary-card"
import { TopicsCard } from "@/features/meetings/topics"
import { TranscriptCard } from "@/features/meetings/transcript-card"
import { useMeetingItems } from "@/features/meetings/use-meeting-items"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatLongDate, formatShortDate, formatWeekdayShort, toDateKey, toTimeLabel } from "@/lib/dates"
import type { ClientDetail, ClientReview, Decision, MeetingItem, MeetingRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface MeetingViewProps {
  entry: MeetingEntry & { record: MeetingRecord }
  transcript: string | null
  /** Pauta guardada no encerramento. */
  frozenAgenda: Agenda | null
  items: MeetingItem[]
  previous: { record: MeetingRecord; date: string }[]
  previousItems: MeetingItem[]
  /** Reunião anterior e próxima da mesma série, para navegar. */
  siblings: { previous: MeetingEntry | null; next: MeetingEntry | null }
  /** Clientes e revisões, para o quadro de clientes da weekly. */
  clients: ClientDetail[]
  clientReviews: ClientReview[]
  /** Decisões registradas nesta reunião. */
  decisions: Decision[]
}

export function MeetingView({
  entry,
  transcript,
  frozenAgenda,
  items,
  previous,
  previousItems,
  siblings,
  clients,
  clientReviews,
  decisions,
}: MeetingViewProps) {
  const { tasks, today, keepInPlace } = useTasks()
  const { currentUser, profiles, projects, clientById } = useWorkspace()
  const { event, record, date } = entry
  const kind = meetingKind(event)
  const clientName = event.client_id ? (clientById.get(event.client_id)?.name ?? null) : null
  const api = useMeetingItems(record.id, items, currentUser.id)

  const closed = record.status !== "scheduled"
  // Encerrada: mostra a pauta guardada. Aberta (ou sem pauta guardada): ao vivo.
  const source: AgendaSource =
    closed && frozenAgenda
      ? { live: false, agenda: frozenAgenda, frozenAt: record.closed_at }
      : {
          live: true,
          agenda: buildAgenda({
            event,
            date,
            today,
            tasks,
            profiles,
            projects,
            previous,
            previousItems,
            keepInPlace,
          }),
        }
  const hasTaskAgenda = kind !== "internal"

  return (
    <PageContainer>
      <MeetingHeader entry={entry} kind={kind} clientName={clientName} siblings={siblings} />
      <MeetingPulse date={date} today={today} time={timeLabel(entry)} api={api} closed={closed} />

      {/*
        Desktop: pauta e transcrição à esquerda; combinados e resumo fixos à
        direita (dá para anotar enquanto percorre a pauta).
        Celular: uma coluna só (as colunas viram "contents" e cada cartão tem
        a sua ordem). Aberta: assuntos, combinados e a pauta. Encerrada:
        combinados e resumo primeiro.
      */}
      <PageBody className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="contents xl:block xl:min-w-0 xl:space-y-6">
          <div className={cn("min-w-0", closed ? "order-3" : "order-1")}>
            <TopicsCard api={api} closed={closed} />
          </div>
          {hasTaskAgenda ? (
            <div className="order-4 min-w-0 space-y-6">
              {!source.live ? <FrozenNote frozenAt={source.frozenAt} /> : null}
              <PreviousAgreementsCard source={source} />
              {kind === "weekly" && source.live ? (
                <ClientsPulseCard clients={clients} reviews={clientReviews} />
              ) : null}
              <TasksAgendaCard source={source} clientName={clientName} />
            </div>
          ) : null}
          <div className="order-6 min-w-0">
            <TranscriptCard meetingId={record.id} initial={transcript} />
          </div>
        </div>
        <div className="contents xl:sticky xl:top-6 xl:block xl:min-w-0 xl:space-y-6">
          <div className={cn("min-w-0", closed ? "order-1" : "order-2")}>
            <AgreementsCard api={api} />
          </div>
          <div className={cn("min-w-0", closed ? "order-2" : "order-3")}>
            <DecisionsCard
              decisions={decisions}
              defaults={{ meeting_id: record.id, client_id: event.client_id }}
              emptyText="O que ficou definido (e passa a valer) nesta reunião. Ex.: preço mínimo, prazo padrão."
            />
          </div>
          <div className={cn("min-w-0", closed ? "order-2" : "order-5")}>
            <SummaryCard meetingId={record.id} initial={record.summary} />
          </div>
        </div>
      </PageBody>
    </PageContainer>
  )
}

/**
 * Painel de destaque da reunião: o dia grande e os números da pauta
 * (assuntos discutidos, combinados e os que ainda estão em aberto).
 */
function MeetingPulse({
  date,
  today,
  time,
  api,
  closed,
}: {
  date: string
  today: string
  time: string
  api: ReturnType<typeof useMeetingItems>
  closed: boolean
}) {
  const { tasks } = useTasks()
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const discussed = api.topics.filter((topic) => topic.done).length
  const open = api.agreements.filter((item) => agreementStatus(item, taskById) !== "done").length
  const isToday = date === today
  return (
    <section
      aria-label="Resumo da reunião"
      className="relative isolate mt-6 flex flex-wrap items-stretch gap-x-8 gap-y-5 overflow-hidden rounded-[2rem] glass-panel px-5 py-5 sm:px-7"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-10 -z-10 h-56 w-96 rounded-full bg-glow-soft blur-3xl"
      />
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={cn(
            "flex w-[72px] flex-col items-center rounded-2xl border py-2.5 leading-none",
            isToday ? "border-glow/50 bg-glow-soft shadow-[0_0_28px_-8px_var(--glow)]" : "border-glass-edge bg-card"
          )}
        >
          <span className="eyebrow text-[10px] text-muted-foreground">{formatWeekdayShort(date)}</span>
          <span className="mt-1 display-number text-[44px] leading-[0.85] text-foreground">{Number(date.slice(8))}</span>
        </span>
        <div>
          <p className="eyebrow text-muted-foreground">{closed ? "Encerrada" : isToday ? "Hoje" : "Reunião"}</p>
          <p className="mt-1 font-display text-xl leading-7 font-medium tracking-tight text-foreground tabular-nums">{time}</p>
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-3 gap-x-5 sm:gap-x-8">
        <PulseStat label="Assuntos" value={api.topics.length} detail={api.topics.length > 0 ? `${discussed} discutidos` : null} />
        <PulseStat label="Combinados" value={api.agreements.length} />
        <PulseStat label="Em aberto" value={open} alert={open > 0 && closed} />
      </dl>
    </section>
  )
}

function PulseStat({
  label,
  value,
  detail,
  alert,
}: {
  label: string
  value: number
  detail?: string | null
  alert?: boolean
}) {
  return (
    <div className="border-t border-foreground/15 pt-3">
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className={cn("display-number text-[40px] leading-[0.85]", alert ? "text-warning-ink" : "text-foreground")}>{value}</span>
        {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
      </dd>
    </div>
  )
}

function SeriesNav({ siblings }: { siblings: MeetingViewProps["siblings"] }) {
  const { today } = useTasks()
  if (!siblings.previous && !siblings.next) return null
  const linkClass =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

  return (
    <div className="flex items-center gap-1 text-[13px]">
      {siblings.previous ? (
        <MeetingLink
          meetingId={siblings.previous.record?.id ?? null}
          eventId={siblings.previous.event.id}
          date={siblings.previous.date}
          className={linkClass}
          aria-label={`Reunião anterior, ${formatShortDate(siblings.previous.date, today)}`}
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          {formatShortDate(siblings.previous.date, today)}
        </MeetingLink>
      ) : null}
      {siblings.next ? (
        <MeetingLink
          meetingId={siblings.next.record?.id ?? null}
          eventId={siblings.next.event.id}
          date={siblings.next.date}
          className={linkClass}
          aria-label={`Próxima reunião, ${formatShortDate(siblings.next.date, today)}`}
        >
          {formatShortDate(siblings.next.date, today)}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </MeetingLink>
      ) : null}
    </div>
  )
}

function MeetingHeader({
  entry,
  kind,
  clientName,
  siblings,
}: {
  entry: MeetingViewProps["entry"]
  kind: ReturnType<typeof meetingKind>
  clientName: string | null
  siblings: MeetingViewProps["siblings"]
}) {
  const router = useRouter()
  const { today } = useTasks()
  const { profileById } = useWorkspace()
  const { event, record, date } = entry
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dialog, setDialog] = useState<EventDialogState>({ open: false, key: 0 })
  const state = entryState(entry, today)
  const closer = record.closed_by ? profileById.get(record.closed_by) : undefined

  function changeStatus(status: MeetingRecord["status"], message: string, description?: string) {
    startTransition(async () => {
      const result = await setMeetingStatus(record.id, status)
      if (result.ok) toast.success(message, { description })
      else toast.error(result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMeeting(record.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast("Registro excluído", { description: event.title })
      router.push("/reunioes")
    })
  }

  return (
    <>
      <PageHeader
        title={event.title}
        description={
          <PageMeta
            items={[
              kind === "client" && event.client_id ? (
                <Link
                  href={`/clientes/${event.client_id}`}
                  aria-label={`Ver o cliente ${clientName ?? ""}`.trim()}
                  className="rounded-full outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <MeetingKindBadge kind={kind} clientName={clientName} />
                </Link>
              ) : (
                <MeetingKindBadge kind={kind} clientName={clientName} />
              ),
              <EntryStateBadge key="state" state={state} />,
              <span key="date">
                {formatLongDate(date)} · <span className="tabular-nums">{timeLabel(entry)}</span>
                {record.status === "scheduled" && date >= today ? ` · ${relativeDays(date, today)}` : null}
              </span>,
              record.status === "done" && record.closed_at ? (
                <span key="closed">
                  Encerrada{closer ? ` por ${firstName(closer.full_name)}` : ""} em{" "}
                  {formatShortDate(toDateKey(record.closed_at), today)} às {toTimeLabel(record.closed_at)}
                </span>
              ) : null,
            ]}
          />
        }
        actions={
          <>
            <SeriesNav siblings={siblings} />
            {record.status === "scheduled" && date > today ? null : record.status === "scheduled" ? (
              <Button
                disabled={isPending}
                onClick={() =>
                  changeStatus("done", "Reunião encerrada", "A pauta ficou guardada no histórico.")
                }
              >
                <CheckCheck />
                Encerrar reunião
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => changeStatus("scheduled", "Reunião reaberta")}
              >
                <RotateCcw />
                Reabrir
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações da reunião" disabled={isPending}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onSelect={() => setDialog((current) => ({ open: true, event, key: current.key + 1 }))}
                >
                  <CalendarCog />
                  Editar data, horário ou nome
                </DropdownMenuItem>
                {record.status === "scheduled" && date > today ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      changeStatus("done", "Reunião encerrada", "A pauta ficou guardada no histórico.")
                    }
                  >
                    <CheckCheck />
                    Encerrar agora
                  </DropdownMenuItem>
                ) : null}
                {record.status === "scheduled" ? (
                  <DropdownMenuItem onSelect={() => changeStatus("canceled", "Reunião marcada como cancelada")}>
                    <Ban />
                    Marcar como cancelada
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Excluir registro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <EventDialog
        state={dialog}
        today={today}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o registro desta reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              Assuntos, combinados, resumo e transcrição de {formatShortDate(date, today)} serão
              apagados. A reunião continua no calendário e as tarefas criadas continuam existindo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
