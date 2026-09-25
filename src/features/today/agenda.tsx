import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { EventTypeDot } from "@/features/calendar/event-type"
import { expandEvents } from "@/features/calendar/recurrence"
import { addDaysToKey, capitalize, formatShortDate, formatWeekdayShort } from "@/lib/dates"
import type { CalendarEvent, DateKey } from "@/lib/types"

function dayLabel(date: DateKey, today: DateKey): string {
  if (date === today) return "Hoje"
  if (date === addDaysToKey(today, 1)) return "Amanhã"
  return `${capitalize(formatWeekdayShort(date))}, ${formatShortDate(date)}`
}

/** Próximos compromissos (7 dias) na lateral da tela Hoje. */
export function Agenda({
  events,
  today,
  limit = 5,
}: {
  events: CalendarEvent[]
  today: DateKey
  limit?: number
}) {
  const upcoming = expandEvents(events, { start: today, end: addDaysToKey(today, 6) }).slice(
    0,
    limit
  )

  return (
    <Card role="region" aria-labelledby="agenda-title">
      <CardHeader>
        <CardTitle id="agenda-title" role="heading" aria-level={2}>
          Próximos compromissos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum compromisso nos próximos 7 dias.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((item) => (
              <li key={item.key} className="flex gap-3">
                <EventTypeDot type={item.event.event_type} className="mt-1.5" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {item.event.title}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {dayLabel(item.date, today)}
                    {item.startTime ? ` · ${item.startTime}` : " · dia inteiro"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href="/calendario"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver calendário
          <ArrowRight className="size-3" />
        </Link>
      </CardFooter>
    </Card>
  )
}
