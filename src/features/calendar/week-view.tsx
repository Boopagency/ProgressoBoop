"use client"

import { Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EventItem, PostItem, TaskItem } from "@/features/calendar/calendar-items"
import { isWeekend, type DayItems } from "@/features/calendar/logic"
import type { Occurrence } from "@/features/calendar/recurrence"
import type { PostSummary } from "@/features/content/logic"
import {
  capitalize,
  formatDayMonth,
  formatWeekdayLong,
  formatWeekdayShort,
} from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Semana: sete colunas quando há espaço (container ≥ 768px); abaixo disso,
 * uma lista por dia (agenda).
 */
export function WeekView({
  days,
  today,
  items,
  onOpenEvent,
  onOpenPost,
  onCreateEvent,
}: {
  days: DateKey[]
  today: DateKey
  items: Map<DateKey, DayItems>
  onOpenEvent: (occurrence: Occurrence) => void
  onOpenPost: (post: PostSummary) => void
  onCreateEvent: (date: DateKey) => void
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card @3xl:grid @3xl:grid-cols-7">
        {days.map((day) => {
          const dayItems = items.get(day)
          const isToday = day === today
          return (
            <div
              key={day}
              className={cn(
                "group/day relative flex min-h-[460px] min-w-0 flex-col border-l first:border-l-0",
                isWeekend(day) && "bg-foreground/[0.015]",
                isToday && "bg-glow-soft/40"
              )}
            >
              {isToday ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-glow shadow-[0_0_14px_2px_var(--glow)]"
                />
              ) : null}
              <div className="flex h-14 items-center justify-between gap-1 border-b px-3">
                <div className="flex items-center gap-2">
                  <span className={cn("eyebrow text-[10.5px]", isToday ? "text-brand-ink" : "text-muted-foreground")}>
                    {formatWeekdayShort(day)}
                  </span>
                  <span
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 display-number text-[19px] tabular-nums",
                      isToday ? "bg-primary text-primary-foreground shadow-glow" : "text-foreground"
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Novo evento em ${formatDayMonth(day)}`}
                  className="text-muted-foreground opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                  onClick={() => onCreateEvent(day)}
                >
                  <Plus />
                </Button>
              </div>
              <div className="flex-1 space-y-1 p-1.5">
                {dayItems?.occurrences.map((occurrence) => (
                  <EventItem key={occurrence.key} occurrence={occurrence} onOpen={onOpenEvent} />
                ))}
                {dayItems?.posts.map((post) => <PostItem key={post.id} post={post} onOpen={onOpenPost} />)}
                {dayItems?.tasks.map((task) => <TaskItem key={task.id} task={task} />)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-6 @3xl:hidden">
        {days.map((day) => {
          const dayItems = items.get(day)
          const empty =
            !dayItems || (dayItems.occurrences.length === 0 && dayItems.tasks.length === 0 && dayItems.posts.length === 0)
          return (
            <section key={day} aria-label={formatDayMonth(day)}>
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="flex items-center gap-2 font-display text-sm font-medium tracking-[-0.01em]">
                  {capitalize(formatWeekdayLong(day))}, {formatDayMonth(day)}
                  {day === today ? (
                    <Badge className="px-2 text-[11px] shadow-glow">Hoje</Badge>
                  ) : null}
                </h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Novo evento em ${formatDayMonth(day)}`}
                  className="text-muted-foreground"
                  onClick={() => onCreateEvent(day)}
                >
                  <Plus />
                </Button>
              </div>
              {empty ? (
                <p className="pt-2 text-[13px] text-subtle-foreground">Nada agendado.</p>
              ) : (
                <div className="space-y-1 pt-2">
                  {dayItems.occurrences.map((occurrence) => (
                    <EventItem key={occurrence.key} occurrence={occurrence} onOpen={onOpenEvent} />
                  ))}
                  {dayItems.posts.map((post) => (
                    <PostItem key={post.id} post={post} onOpen={onOpenPost} />
                  ))}
                  {dayItems.tasks.map((task) => (
                    <TaskItem key={task.id} task={task} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
