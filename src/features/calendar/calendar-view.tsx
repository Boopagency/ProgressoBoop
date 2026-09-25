"use client"

import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { deleteEvent } from "@/features/calendar/actions"
import { EventDialog, type EventDialogState } from "@/features/calendar/event-dialog"
import { EventSheet } from "@/features/calendar/event-sheet"
import { EVENT_TYPE_STYLE } from "@/features/calendar/event-type"
import { itemsByDay, type CalendarView as View } from "@/features/calendar/logic"
import type { Occurrence } from "@/features/calendar/recurrence"
import { expandEvents } from "@/features/calendar/recurrence"
import { useTasks } from "@/features/tasks/tasks-provider"
import { MonthView } from "@/features/calendar/month-view"
import { WeekView } from "@/features/calendar/week-view"
import {
  addDaysToKey,
  addMonthsToKey,
  eachDayKey,
  formatMonthYear,
  formatRange,
  isDateKey,
  isWithin,
  monthGridRangeOf,
  monthRangeOf,
  weekRangeOf,
  type DateRange,
} from "@/lib/dates"
import { EVENT_TYPE_LABEL, EVENT_TYPES } from "@/lib/labels"
import type { CalendarEvent, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const VIEW_OPTIONS = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
] as const

function periodLabel(view: View, anchor: DateKey, range: DateRange): string {
  if (view === "month") return formatMonthYear(anchor)
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4)
  return sameYear ? `${formatRange(range)} de ${range.end.slice(0, 4)}` : formatRange(range)
}

export function CalendarView({ events }: { events: CalendarEvent[] }) {
  const { tasks, today } = useTasks()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Visão e data ficam na URL (?visao=mes&data=2026-10-01).
  const view: View = searchParams.get("visao") === "mes" ? "month" : "week"
  const dataParam = searchParams.get("data")
  const anchor = isDateKey(dataParam) ? dataParam : today

  function navigate(next: { view?: View; anchor?: DateKey }) {
    const params = new URLSearchParams()
    if ((next.view ?? view) === "month") params.set("visao", "mes")
    const nextAnchor = next.anchor ?? anchor
    if (nextAnchor !== today) params.set("data", nextAnchor)
    const query = params.toString()
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }

  function step(direction: -1 | 1) {
    navigate({
      anchor:
        view === "week"
          ? addDaysToKey(anchor, 7 * direction)
          : addMonthsToKey(monthRangeOf(anchor).start, direction),
    })
  }

  const range = view === "week" ? weekRangeOf(anchor) : monthGridRangeOf(anchor)
  const days = eachDayKey(range)
  const items = itemsByDay(range, events, tasks)
  const showsToday = isWithin(today, view === "week" ? range : monthRangeOf(anchor))

  // Detalhes do evento: guarda id + dia e lê o evento atual (reflete edições).
  const [selected, setSelected] = useState<{ eventId: string; date: DateKey; open: boolean } | null>(
    null
  )
  const selectedEvent = selected ? events.find((event) => event.id === selected.eventId) : undefined
  const selectedOccurrence: Occurrence | null =
    selected && selectedEvent
      ? (expandEvents([selectedEvent], { start: selected.date, end: selected.date })[0] ?? null)
      : null

  const [dialog, setDialog] = useState<EventDialogState>({ open: false, key: 0 })
  const [, startDeleting] = useTransition()

  function openEvent(occurrence: Occurrence) {
    setSelected({ eventId: occurrence.event.id, date: occurrence.date, open: true })
  }

  function createEventOn(date?: DateKey) {
    setDialog((current) => ({ open: true, date, key: current.key + 1 }))
  }

  function editEvent(occurrence: Occurrence) {
    setSelected((current) => (current ? { ...current, open: false } : current))
    setDialog((current) => ({ open: true, event: occurrence.event, key: current.key + 1 }))
  }

  function removeEvent(occurrence: Occurrence) {
    setSelected((current) => (current ? { ...current, open: false } : current))
    startDeleting(async () => {
      const result = await deleteEvent(occurrence.event.id)
      if (result.ok) toast("Evento excluído", { description: occurrence.event.title })
      else toast.error(result.error)
    })
  }

  return (
    <PageContainer className="@container">
      <PageHeader
        title="Calendário"
        description="Prazos das tarefas, reuniões, eventos internos e entregas."
        actions={
          <>
            <SegmentedControl
              aria-label="Visualização"
              value={view}
              onValueChange={(next) => navigate({ view: next })}
              options={VIEW_OPTIONS}
            />
            <Button onClick={() => createEventOn(showsToday ? undefined : anchor)} className="gap-1.5">
              <Plus />
              Novo evento
            </Button>
          </>
        }
      />

      <div className="mt-7 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={view === "week" ? "Semana anterior" : "Mês anterior"}
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={view === "week" ? "Próxima semana" : "Próximo mês"}
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground" aria-live="polite">
            {periodLabel(view, anchor, range)}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className={cn("ml-1 h-7 px-2.5 text-xs shadow-none", showsToday && "invisible")}
            onClick={() => navigate({ anchor: today })}
          >
            Hoje
          </Button>
        </div>
        <Legend />
      </div>

      {view === "week" ? (
        <WeekView
          days={days}
          today={today}
          items={items}
          onOpenEvent={openEvent}
          onCreateEvent={createEventOn}
        />
      ) : (
        <MonthView
          days={days}
          month={monthRangeOf(anchor).start.slice(0, 7)}
          today={today}
          items={items}
          onOpenEvent={openEvent}
        />
      )}

      <EventSheet
        occurrence={selectedOccurrence}
        open={Boolean(selected?.open && selectedOccurrence)}
        onOpenChange={(open) => setSelected((current) => (current ? { ...current, open } : current))}
        onEdit={editEvent}
        onDelete={removeEvent}
      />
      <EventDialog
        state={dialog}
        today={today}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </PageContainer>
  )
}

function Legend() {
  return (
    <ul className="hidden items-center gap-4 text-xs text-muted-foreground @3xl:flex">
      {EVENT_TYPES.map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", EVENT_TYPE_STYLE[type].dot)} />
          {EVENT_TYPE_LABEL[type]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full border border-muted-foreground/60" />
        Tarefa
      </li>
    </ul>
  )
}
