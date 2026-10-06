import type { Metadata } from "next"

import { CalendarView } from "@/features/calendar/calendar-view"
import { getEvents } from "@/features/calendar/queries"
import { getMeetingRecords } from "@/features/meetings/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Calendário" }

export default async function CalendarPage() {
  const [tasks, events, { records }] = await Promise.all([
    getTasks(),
    getEvents(),
    getMeetingRecords(),
  ])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <CalendarView events={events} meetingRecords={records} />
    </TasksProvider>
  )
}
