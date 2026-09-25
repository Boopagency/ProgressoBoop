import {
  addDaysToKey,
  daysBetween,
  isWithin,
  toDateKey,
  toTimeLabel,
  type DateRange,
} from "@/lib/dates"
import type { CalendarEvent, DateKey } from "@/lib/types"

/** Uma ocorrência concreta de um evento (recorrente ou não) num dia. */
export interface Occurrence {
  /** `${event.id}:${date}` — estável entre renderizações. */
  key: string
  event: CalendarEvent
  date: DateKey
  /** "07:00"; `null` para eventos de dia inteiro. */
  startTime: string | null
  endTime: string | null
}

function occurrence(event: CalendarEvent, date: DateKey): Occurrence {
  return {
    key: `${event.id}:${date}`,
    event,
    date,
    startTime: event.all_day ? null : toTimeLabel(event.start_at),
    endTime: event.all_day || !event.end_at ? null : toTimeLabel(event.end_at),
  }
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  // Dia inteiro primeiro, depois por horário.
  if (a.startTime !== b.startTime) {
    if (a.startTime === null) return -1
    if (b.startTime === null) return 1
    return a.startTime < b.startTime ? -1 : 1
  }
  return a.event.title.localeCompare(b.event.title, "pt-BR")
}

/**
 * Expande os eventos para o período: recorrentes semanais repetem no mesmo
 * dia da semana e horário (em São Paulo) a partir da primeira ocorrência.
 */
export function expandEvents(events: CalendarEvent[], range: DateRange): Occurrence[] {
  const result: Occurrence[] = []

  for (const event of events) {
    const firstDate = toDateKey(event.start_at)

    if (event.recurrence === "weekly") {
      let date = firstDate
      if (date < range.start) {
        const weeksToSkip = Math.ceil(daysBetween(firstDate, range.start) / 7)
        date = addDaysToKey(firstDate, weeksToSkip * 7)
      }
      for (; date <= range.end; date = addDaysToKey(date, 7)) {
        result.push(occurrence(event, date))
      }
    } else if (isWithin(firstDate, range)) {
      result.push(occurrence(event, firstDate))
    }
  }

  return result.sort(compareOccurrences)
}
