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
import { ClientsPulseCard } from "@/features/clients/client-pulse"
import { DecisionsCard } from "@/features/decisions/decisions-card"
import { deleteMeeting, setMeetingStatus } from "@/features/meetings/actions"
import { FrozenNote, PreviousAgreementsCard, TasksAgendaCard, type AgendaSource } from "@/features/meetings/agenda-panel"
import { AgreementsCard } from "@/features/meetings/agreements"
import {
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
import { formatLongDate, formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
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
    <PageContainer className="max-w-[1320px]">
      <nav aria-label="Navegação" className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <Link
          href="/reunioes"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Reuniões
        </Link>
        <SeriesNav siblings={siblings} />
      </nav>

      <MeetingHeader entry={entry} kind={kind} clientName={clientName} />

      {/*
        Desktop: pauta e transcrição à esquerda; combinados e resumo fixos à
        direita (dá para anotar enquanto percorre a pauta).
        Celular: uma coluna só (as colunas viram "contents" e cada cartão tem
        a sua ordem). Aberta: assuntos, combinados e a pauta. Encerrada:
        combinados e resumo primeiro.
      */}
      <div className="mt-8 flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
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
      </div>
    </PageContainer>
  )
}

function SeriesNav({ siblings }: { siblings: MeetingViewProps["siblings"] }) {
  const { today } = useTasks()
  if (!siblings.previous && !siblings.next) return null
  const linkClass =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

  return (
    <div className="flex items-center gap-1">
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
}: {
  entry: MeetingViewProps["entry"]
  kind: ReturnType<typeof meetingKind>
  clientName: string | null
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
    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {kind === "client" && event.client_id ? (
            <Link
              href={`/clientes/${event.client_id}`}
              aria-label={`Ver o cliente ${clientName ?? ""}`.trim()}
              className="rounded-full outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MeetingKindBadge kind={kind} clientName={clientName} />
            </Link>
          ) : (
            <MeetingKindBadge kind={kind} clientName={clientName} />
          )}
          <EntryStateBadge state={state} />
        </div>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-9">
          {event.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(date)} · <span className="tabular-nums">{timeLabel(entry)}</span>
          {record.status === "scheduled" && date >= today ? ` · ${relativeDays(date, today)}` : null}
        </p>
        {record.status === "done" && record.closed_at ? (
          <p className="text-xs text-muted-foreground">
            Encerrada{closer ? ` por ${firstName(closer.full_name)}` : ""} em{" "}
            {formatShortDate(toDateKey(record.closed_at), today)} às {toTimeLabel(record.closed_at)}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
      </div>

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
    </div>
  )
}
