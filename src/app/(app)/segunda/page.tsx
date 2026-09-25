import type { Metadata } from "next"

import { getEvents } from "@/features/calendar/queries"
import { WEEKLY, weeklyRecurrenceLabel } from "@/features/calendar/recurrence"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { weekContext } from "@/features/weekly/logic"
import { getDecisions } from "@/features/weekly/queries"
import { WeeklyView } from "@/features/weekly/weekly-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Segunda" }

export default async function WeeklyPage() {
  const today = todayKey()
  const ctx = weekContext(today)
  const [tasks, decisions, events] = await Promise.all([
    getTasks(),
    getDecisions([ctx.week.start, ctx.previousWeek.start]),
    getEvents(),
  ])

  const meeting = events.find(
    (event) => event.recurrence_rule === WEEKLY && event.event_type === "meeting"
  )
  const meetingLabel = meeting ? `Reunião ${weeklyRecurrenceLabel(meeting)}` : null

  return (
    <TasksProvider tasks={tasks} today={today}>
      <WeeklyView decisions={decisions} meetingLabel={meetingLabel} />
    </TasksProvider>
  )
}
