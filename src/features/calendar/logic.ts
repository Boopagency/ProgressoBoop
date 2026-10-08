import { expandEvents, type Occurrence } from "@/features/calendar/recurrence"
import { comparePosts, type PostSummary } from "@/features/content/logic"
import { compareTasks } from "@/features/tasks/logic"
import { eachDayKey, isWithin, type DateRange } from "@/lib/dates"
import type { CalendarEvent, DateKey, Task } from "@/lib/types"

export type CalendarView = "week" | "month"

export interface DayItems {
  occurrences: Occurrence[]
  tasks: Task[]
  /** Posts da Central de Conteúdo com publicação no dia (só leitura aqui). */
  posts: PostSummary[]
}

/** Eventos (já expandidos), tarefas com prazo e posts, organizados por dia do período. */
export function itemsByDay(
  range: DateRange,
  events: CalendarEvent[],
  tasks: Task[],
  posts: PostSummary[] = []
): Map<DateKey, DayItems> {
  const days = new Map<DateKey, DayItems>(
    eachDayKey(range).map((day) => [day, { occurrences: [], tasks: [], posts: [] }])
  )
  for (const occurrence of expandEvents(events, range)) {
    days.get(occurrence.date)?.occurrences.push(occurrence)
  }
  for (const task of tasks) {
    if (task.due_date && isWithin(task.due_date, range)) days.get(task.due_date)?.tasks.push(task)
  }
  for (const post of posts) {
    if (post.publish_on && isWithin(post.publish_on, range)) days.get(post.publish_on)?.posts.push(post)
  }
  for (const items of days.values()) {
    items.tasks.sort(compareTasks)
    items.posts.sort(comparePosts)
  }
  return days
}

export function isWeekend(day: DateKey): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}
