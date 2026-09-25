"use client"

import {
  Building2,
  CalendarDays,
  Clock,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { EventTypeDot } from "@/features/calendar/event-type"
import { weeklyRecurrenceLabel, type Occurrence } from "@/features/calendar/recurrence"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { capitalize, formatLongDate } from "@/lib/dates"
import { EVENT_TYPE_LABEL } from "@/lib/labels"

/** Detalhes de um evento (ou de uma ocorrência de evento recorrente). */
export function EventSheet({
  occurrence,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  occurrence: Occurrence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (occurrence: Occurrence) => void
  onDelete: (occurrence: Occurrence) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
        {occurrence ? (
          <EventDetails occurrence={occurrence} onEdit={onEdit} onDelete={onDelete} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function EventDetails({
  occurrence,
  onEdit,
  onDelete,
}: {
  occurrence: Occurrence
  onEdit: (occurrence: Occurrence) => void
  onDelete: (occurrence: Occurrence) => void
}) {
  const { profileById, clientById } = useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { event } = occurrence
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
          {event.recurrence === "weekly" ? (
            <DetailRow icon={<Repeat />} label="Repetição">
              {capitalize(weeklyRecurrenceLabel(event))}
            </DetailRow>
          ) : null}
          {client ? (
            <DetailRow icon={<Building2 />} label="Cliente">
              {client.name}
            </DetailRow>
          ) : null}
        </dl>
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
        <Button variant="outline" size="sm" onClick={() => onEdit(occurrence)}>
          <Pencil />
          Editar
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {event.recurrence ? "Excluir todas as ocorrências?" : "Excluir este evento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {event.recurrence
                ? `“${event.title}” é recorrente. A série inteira será removida do calendário.`
                : `“${event.title}” será removido do calendário.`}
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
