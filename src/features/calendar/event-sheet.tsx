"use client"

import {
  ArrowRight,
  Building2,
  CalendarDays,
  Clock,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState, type ReactNode } from "react"

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
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { EventTypeDot } from "@/features/calendar/event-type"
import { WEEKLY, weeklyRecurrenceLabel, type Occurrence } from "@/features/calendar/recurrence"
import { isMeetingEvent, recordFor } from "@/features/meetings/logic"
import { EntryStateBadge, entryState } from "@/features/meetings/meeting-meta"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { capitalize, formatLongDate } from "@/lib/dates"
import { EVENT_TYPE_LABEL } from "@/lib/labels"
import type { DateKey, MeetingRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Detalhes de um evento (ou de uma ocorrência de evento recorrente). */
export function EventSheet({
  occurrence,
  records,
  today,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  occurrence: Occurrence | null
  /** Registros de reunião, para mostrar a situação e avisar ao excluir. */
  records: MeetingRecord[]
  today: DateKey
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (occurrence: Occurrence) => void
  onDelete: (occurrence: Occurrence) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
        {occurrence ? (
          <EventDetails
            occurrence={occurrence}
            records={records}
            today={today}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function EventDetails({
  occurrence,
  records,
  today,
  onEdit,
  onDelete,
}: {
  occurrence: Occurrence
  records: MeetingRecord[]
  today: DateKey
  onEdit: (occurrence: Occurrence) => void
  onDelete: (occurrence: Occurrence) => void
}) {
  const { profileById, clientById } = useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { event } = occurrence
  const isMeeting = isMeetingEvent(event)
  const record = isMeeting ? recordFor(records, event, occurrence.date) : null
  const recordCount = isMeeting ? records.filter((candidate) => candidate.event_id === event.id).length : 0
  const client = event.client_id ? clientById.get(event.client_id) : undefined
  const creator = profileById.get(event.created_by)
  const time = occurrence.startTime
    ? occurrence.endTime
      ? `${occurrence.startTime} – ${occurrence.endTime}`
      : occurrence.startTime
    : "Dia inteiro"

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{event.title}</SheetTitle>
      <SheetDescription className="sr-only">Detalhes do evento.</SheetDescription>

      <div className="flex h-12 shrink-0 items-center gap-2 border-b pr-12 pl-5">
        <EventTypeDot type={event.event_type} />
        <span className="text-xs text-muted-foreground">{EVENT_TYPE_LABEL[event.event_type]}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label="Mais ações"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(occurrence)}>
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <h2 className="text-lg leading-7 font-semibold tracking-tight text-foreground">
          {event.title}
        </h2>
        <dl className="mt-5 space-y-3 text-sm">
          <DetailRow icon={<CalendarDays />} label="Data">
            {formatLongDate(occurrence.date)}
          </DetailRow>
          <DetailRow icon={<Clock />} label="Horário">
            <span className="tabular-nums">{time}</span>
          </DetailRow>
          {event.recurrence_rule === WEEKLY ? (
            <DetailRow icon={<Repeat />} label="Repetição">
              {capitalize(weeklyRecurrenceLabel(event))}
            </DetailRow>
          ) : null}
          {client ? (
            <DetailRow icon={<Building2 />} label="Cliente">
              <Link
                href={`/clientes/${client.id}`}
                className="font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
              >
                {client.name}
              </Link>
            </DetailRow>
          ) : null}
        </dl>
        {isMeeting ? (
          <div className="mt-6 rounded-lg border bg-muted/30 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-medium text-foreground">Pauta e combinados</h3>
              <EntryStateBadge
                state={entryState(
                  { key: "", event, date: occurrence.date, startTime: null, endTime: null, record },
                  today
                )}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Assuntos, combinados, resumo e transcrição ficam na página da reunião.
            </p>
          </div>
        ) : null}
        {event.description ? (
          <div className="mt-6 border-t pt-5">
            <h3 className="text-[13px] font-medium text-foreground">Descrição</h3>
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">
              {event.description}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Criado por {creator ? firstName(creator.full_name) : "alguém da equipe"}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(occurrence)}>
            <Pencil />
            Editar
          </Button>
          {isMeeting ? (
            <MeetingLink
              meetingId={record?.id ?? null}
              eventId={event.id}
              date={occurrence.date}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Abrir reunião
              <ArrowRight />
            </MeetingLink>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {event.recurrence_rule ? "Excluir todas as ocorrências?" : "Excluir este evento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {event.recurrence_rule
                ? `“${event.title}” é recorrente. A série inteira será removida do calendário.`
                : `“${event.title}” será removido do calendário.`}
              {recordCount > 0
                ? recordCount === 1
                  ? " O registro da reunião (assuntos, combinados, resumo e transcrição) também será apagado."
                  : ` Os ${recordCount} registros de reunião (assuntos, combinados, resumos e transcrições) também serão apagados.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDelete(occurrence)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="mt-0.5 text-muted-foreground [&_svg]:size-4">
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}
