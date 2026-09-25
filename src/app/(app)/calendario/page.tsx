import type { Metadata } from "next"

import { CalendarView } from "@/features/calendar/calendar-view"
import { getEvents } from "@/features/calendar/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Calendário" }

export default async function CalendarPage() {
  const [tasks, events] = await Promise.all([getTasks(), getEvents()])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <CalendarView events={events} />
    </TasksProvider>
  )
}
