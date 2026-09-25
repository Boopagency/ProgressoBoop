"use client"

import { useState } from "react"

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EventItem, TaskItem } from "@/features/calendar/calendar-items"
import { EVENT_TYPE_STYLE } from "@/features/calendar/event-type"
import { isWeekend, type DayItems } from "@/features/calendar/logic"
import type { Occurrence } from "@/features/calendar/recurrence"
import { capitalize, formatDayMonth, formatWeekdayLong, formatWeekdayShort } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const VISIBLE_ITEMS = 3

/**
 * Mês: grade de semanas (segunda a domingo). Em telas largas cada dia lista
 * até três itens; em telas estreitas mostra pontos e abre a lista ao tocar.
 */
export function MonthView({
  days,
  month,
  today,
  items,
  onOpenEvent,
}: {
  days: DateKey[]
  /** "yyyy-MM" do mês exibido. */
  month: string
  today: DateKey
  items: Map<DateKey, DayItems>
  onOpenEvent: (occurrence: Occurrence) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs text-muted-foreground @3xl:text-left">
            {formatWeekdayShort(day)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <DayCell
            key={day}
            day={day}
            outside={!day.startsWith(month)}
            isToday={day === today}
            firstColumn={index % 7 === 0}
            firstRow={index < 7}
            items={items.get(day) ?? { occurrences: [], tasks: [] }}
            onOpenEvent={onOpenEvent}
          />
        ))}
      </div>
    </div>
  )
}

function DayCell({
  day,
  outside,
  isToday,
  firstColumn,
  firstRow,
  items,
  onOpenEvent,
}: {
  day: DateKey
  outside: boolean
  isToday: boolean
  firstColumn: boolean
  firstRow: boolean
  items: DayItems
  onOpenEvent: (occurrence: Occurrence) => void
}) {
  const [open, setOpen] = useState(false)
  const total = items.occurrences.length + items.tasks.length
  const hidden = Math.max(total - VISIBLE_ITEMS, 0)
  const visibleEvents = items.occurrences.slice(0, VISIBLE_ITEMS)
  const visibleTasks = items.tasks.slice(0, Math.max(VISIBLE_ITEMS - visibleEvents.length, 0))

  function openEvent(occurrence: Occurrence) {
    setOpen(false)
    onOpenEvent(occurrence)
  }

  const dayNumber = (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums",
        isToday && "bg-primary text-primary-foreground",
        !isToday && outside && "text-subtle-foreground"
      )}
    >
      {Number(day.slice(8))}
    </span>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "min-h-16 min-w-0 border-t border-l p-1 @3xl:min-h-[118px]",
            firstColumn && "border-l-0",
            firstRow && "border-t-0",
            isWeekend(day) && "bg-muted/25",
            outside && "bg-muted/40"
          )}
        >
          {/* Estreito: o dia inteiro é um botão com pontos por item. */}
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={total === 0}
              aria-label={`${formatDayMonth(day)}: ${total} ${total === 1 ? "item" : "itens"}`}
              className="flex w-full flex-col items-center gap-1 rounded-md py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default @3xl:hidden"
            >
              {dayNumber}
              <span className="flex h-1.5 items-center gap-0.5">
                {items.occurrences.slice(0, 3).map((occurrence) => (
                  <span
                    key={occurrence.key}
                    className={cn(
                      "size-1.5 rounded-full",
                      EVENT_TYPE_STYLE[occurrence.event.event_type].dot
                    )}
                  />
                ))}
                {items.tasks.length > 0 ? (
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                ) : null}
              </span>
            </button>
          </PopoverTrigger>

          {/* Largo: número do dia e até três itens. */}
          <div className="hidden @3xl:block">
            <div className="px-1 pt-0.5 pb-1">{dayNumber}</div>
            <div className="space-y-px">
              {visibleEvents.map((occurrence) => (
                <EventItem key={occurrence.key} occurrence={occurrence} onOpen={openEvent} compact />
              ))}
              {visibleTasks.map((task) => (
                <TaskItem key={task.id} task={task} compact />
              ))}
              {hidden > 0 ? (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="w-full rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  +{hidden} {hidden === 1 ? "item" : "itens"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1.5 pt-1 pb-2 text-xs font-medium text-muted-foreground">
          {capitalize(formatWeekdayLong(day))}, {formatDayMonth(day)}
        </p>
        <div className="space-y-px" onClickCapture={() => setOpen(false)}>
          {items.occurrences.map((occurrence) => (
            <EventItem key={occurrence.key} occurrence={occurrence} onOpen={openEvent} compact />
          ))}
          {items.tasks.map((task) => (
            <TaskItem key={task.id} task={task} compact />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
