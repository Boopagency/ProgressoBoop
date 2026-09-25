import type { Metadata } from "next"
import { cookies } from "next/headers"

import { getEvents } from "@/features/calendar/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { parseTodayScope, TODAY_SCOPE_COOKIE } from "@/features/today/constants"
import { TodayView } from "@/features/today/today-view"
import { greetingFor, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Hoje" }

export default async function TodayPage() {
  const [tasks, events, cookieStore] = await Promise.all([getTasks(), getEvents(), cookies()])
  const now = new Date()
  const today = todayKey(now)

  return (
    <TasksProvider tasks={tasks} today={today}>
      <TodayView
        greeting={greetingFor(now)}
        events={events}
        initialScope={parseTodayScope(cookieStore.get(TODAY_SCOPE_COOKIE)?.value)}
      />
    </TasksProvider>
  )
}
