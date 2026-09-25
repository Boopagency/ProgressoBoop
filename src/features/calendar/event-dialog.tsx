"use client"

import { Building2, CalendarDays } from "lucide-react"
import { startTransition, useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createEvent, updateEvent } from "@/features/calendar/actions"
import { WEEKLY, weeklyRecurrenceLabel } from "@/features/calendar/recurrence"
import type { EventInput } from "@/features/calendar/validation"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import {
  capitalize,
  formatShortDate,
  formatWeekdayShort,
  isTimeLabel,
  toDateKey,
  toTimeLabel,
  zonedTimeToInstant,
} from "@/lib/dates"
import { EVENT_TYPE_LABEL, EVENT_TYPES } from "@/lib/labels"
import type { CalendarEvent, DateKey, EventType } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface EventDialogState {
  open: boolean
  /** Evento em edição; ausente para criar um novo. */
  event?: CalendarEvent
  /** Data sugerida ao criar. */
  date?: DateKey
  key: number
}

const TYPE_OPTIONS = EVENT_TYPES.map((type) => ({ value: type, label: EVENT_TYPE_LABEL[type] }))
const NONE = "none"

export function EventDialog({
  state,
  today,
  onOpenChange,
}: {
  state: EventDialogState
  today: DateKey
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[8%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12%] sm:max-w-[540px]"
      >
        <DialogTitle className="sr-only">{state.event ? "Editar evento" : "Novo evento"}</DialogTitle>
        <DialogDescription className="sr-only">
          Título, tipo, data e horário do evento.
        </DialogDescription>
        <EventForm
          key={state.key}
          event={state.event}
          initialDate={state.date ?? today}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function EventForm({
  event,
  initialDate,
  today,
  onDone,
}: {
  event?: CalendarEvent
  initialDate: DateKey
  today: DateKey
  onDone: () => void
}) {
  const { clients } = useWorkspace()
  const ids = useId()
  const timed = event ? !event.all_day : true
  const [title, setTitle] = useState(event?.title ?? "")
  const [type, setType] = useState<EventType>(event?.event_type ?? "meeting")
  const [date, setDate] = useState<DateKey>(event ? toDateKey(event.start_at) : initialDate)
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [startTime, setStartTime] = useState(event && timed ? toTimeLabel(event.start_at) : "09:00")
  const [endTime, setEndTime] = useState(
    event?.end_at && timed ? toTimeLabel(event.end_at) : event ? "" : "10:00"
  )
  const [weekly, setWeekly] = useState(event?.recurrence_rule === WEEKLY)
  const [clientId, setClientId] = useState<string | null>(event?.client_id ?? null)
  const [description, setDescription] = useState(event?.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startSaving] = useTransition()

  function submit() {
    if (isPending) return
    if (!title.trim()) {
      setError("Dê um título ao evento.")
      return
    }
    setError(null)
    const input: EventInput = {
      title,
      description: description || null,
      event_type: type,
      date,
      all_day: allDay,
      start_time: allDay ? null : startTime,
      end_time: allDay || !endTime ? null : endTime,
      recurrence_rule: weekly ? WEEKLY : null,
      client_id: clientId,
    }
    startSaving(async () => {
      const result = event ? await updateEvent(event.id, input) : await createEvent(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      startTransition(onDone)
      toast.success(event ? "Evento atualizado" : "Evento criado", { description: title.trim() })
    })
  }

  // Rótulo da recorrência com o dia e horário escolhidos.
  const recurrenceHint = weeklyRecurrenceLabel({
    start_at: zonedTimeToInstant(date, !allDay && isTimeLabel(startTime) ? startTime : "00:00"),
    all_day: allDay,
  })

  return (
    <form
      onSubmit={(formEvent) => {
        formEvent.preventDefault()
        submit()
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey)) {
          keyEvent.preventDefault()
          submit()
        }
      }}
    >
      <div className="space-y-5 px-5 pt-5 pb-5">
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            {event ? "Editar evento" : "Novo evento"}
          </p>
          <input
            autoFocus
            value={title}
            onChange={(changeEvent) => {
              setTitle(changeEvent.target.value)
              if (error) setError(null)
            }}
            placeholder="Nome do evento"
            aria-label="Título"
            maxLength={200}
            className="w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
          />
        </div>

        <SegmentedControl
          aria-label="Tipo"
          value={type}
          onValueChange={setType}
          options={TYPE_OPTIONS}
        />

        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
          <span className="text-[13px] text-muted-foreground">{weekly ? "A partir de" : "Data"}</span>
          <DatePicker
            value={date}
            onChange={(next) => {
              if (next) setDate(next)
            }}
            today={today}
            placeholder="Data"
            aria-label="Data"
            icon={<CalendarDays className="size-3.5 text-muted-foreground" />}
            renderValue={(value) => (
              <span>
                {capitalize(formatWeekdayShort(value))}, {formatShortDate(value, today)}
              </span>
            )}
            className="h-8 w-fit border px-2.5 text-[13px]"
          />

          <span className="text-[13px] text-muted-foreground">Horário</span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              aria-label="Início"
              value={startTime}
              disabled={allDay}
              onChange={(changeEvent) => setStartTime(changeEvent.target.value)}
              className={cn("h-8 w-[128px] shadow-none", allDay && "opacity-40")}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="time"
              aria-label="Término"
              value={endTime}
              disabled={allDay}
              onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
              className={cn("h-8 w-[128px] shadow-none", allDay && "opacity-40")}
            />
            <div className="ml-1 flex items-center gap-2">
              <Checkbox
                id={`${ids}-all-day`}
                checked={allDay}
                onCheckedChange={(checked) => setAllDay(checked === true)}
              />
              <Label htmlFor={`${ids}-all-day`} className="text-[13px] font-normal">
                Dia inteiro
              </Label>
            </div>
          </div>

          <span className="text-[13px] text-muted-foreground">Repetir</span>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${ids}-weekly`}
              checked={weekly}
              onCheckedChange={(checked) => setWeekly(checked === true)}
            />
            <Label htmlFor={`${ids}-weekly`} className="text-[13px] font-normal">
              Toda semana
              {weekly ? <span className="text-muted-foreground"> · {recurrenceHint}</span> : null}
            </Label>
          </div>

          <span className="text-[13px] text-muted-foreground">Cliente</span>
          <Select
            value={clientId ?? NONE}
            onValueChange={(value) => setClientId(value === NONE ? null : value)}
          >
            <SelectTrigger size="sm" aria-label="Cliente" className="h-8 w-fit gap-1.5 text-[13px] shadow-none">
              <Building2 className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value={NONE} className="text-muted-foreground">
                Nenhum
              </SelectItem>
              {clients
                .filter((client) => client.active || client.id === clientId)
                .map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <textarea
          value={description}
          onChange={(changeEvent) => setDescription(changeEvent.target.value)}
          placeholder="Descrição (opcional)"
          aria-label="Descrição"
          rows={2}
          className="field-sizing-content max-h-40 min-h-16 w-full resize-none rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p
          className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
          role={error ? "alert" : undefined}
        >
          {error ?? (event?.recurrence_rule ? "Alterações valem para todas as ocorrências." : null)}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : event ? "Salvar" : "Criar evento"}
          </Button>
        </div>
      </div>
    </form>
  )
}
