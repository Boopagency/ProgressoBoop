import type { Metadata } from "next"
import { cookies } from "next/headers"

import { getEvents } from "@/features/calendar/queries"
import { getClientReviews, getClients } from "@/features/clients/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { parseTodayScope, TODAY_SCOPE_COOKIE } from "@/features/today/constants"
import { TodayView } from "@/features/today/today-view"
import { greetingFor, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Hoje" }

export default async function TodayPage() {
  const [tasks, events, clients, reviews, cookieStore] = await Promise.all([
    getTasks(),
    getEvents(),
    getClients(),
    getClientReviews(),
    cookies(),
  ])
  const now = new Date()
  const today = todayKey(now)

  return (
    <TasksProvider tasks={tasks} today={today}>
      <TodayView
        greeting={greetingFor(now)}
        events={events}
        clients={clients}
        reviews={reviews}
        initialScope={parseTodayScope(cookieStore.get(TODAY_SCOPE_COOKIE)?.value)}
      />
    </TasksProvider>
  )
}
