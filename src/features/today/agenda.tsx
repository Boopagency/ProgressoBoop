import { ArrowRight, ChevronRight } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { EventTypeDot } from "@/features/calendar/event-type"
import { expandEvents, type Occurrence } from "@/features/calendar/recurrence"
import { isMeetingEvent } from "@/features/meetings/logic"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { addDaysToKey, capitalize, formatShortDate, formatWeekdayShort } from "@/lib/dates"
import type { CalendarEvent, DateKey } from "@/lib/types"

function dayLabel(date: DateKey, today: DateKey): string {
  if (date === today) return "Hoje"
  if (date === addDaysToKey(today, 1)) return "Amanhã"
  return `${capitalize(formatWeekdayShort(date))}, ${formatShortDate(date)}`
}

function AgendaItem({ item, today }: { item: Occurrence; today: DateKey }) {
  return (
    <>
      <EventTypeDot type={item.event.event_type} className="mt-1.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {item.event.title}
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {dayLabel(item.date, today)}
          {item.startTime ? ` · ${item.startTime}` : " · dia inteiro"}
        </span>
      </span>
    </>
  )
}

/** Próximos compromissos (7 dias) na lateral da tela Hoje. Reuniões abrem a pauta. */
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
          <ul className="-mx-2 space-y-1">
            {upcoming.map((item) => (
              <li key={item.key}>
                {isMeetingEvent(item.event) ? (
                  <MeetingLink
                    meetingId={null}
                    eventId={item.event.id}
                    date={item.date}
                    aria-label={`Abrir a pauta de ${item.event.title}, ${dayLabel(item.date, today)}`}
                    className="group/agenda flex w-full gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/70"
                  >
                    <AgendaItem item={item} today={today} />
                    <ChevronRight
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/agenda:opacity-100"
                      aria-hidden="true"
                    />
                  </MeetingLink>
                ) : (
                  <div className="flex gap-3 px-2 py-1.5">
                    <AgendaItem item={item} today={today} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href="/calendario"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-brand-ink"
        >
          Ver calendário
          <ArrowRight className="size-3" />
        </Link>
      </CardFooter>
    </Card>
  )
}
