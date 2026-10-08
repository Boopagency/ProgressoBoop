import type { Metadata } from "next"
import { cookies } from "next/headers"

import { getEvents } from "@/features/calendar/queries"
import { getClientReviews, getClients } from "@/features/clients/queries"
import { getContentPosts } from "@/features/content/queries"
import { getDeals } from "@/features/deals/queries"
import { getDocs } from "@/features/docs/queries"
import { getFinance } from "@/features/finance/queries"
import { getMeetingRecords } from "@/features/meetings/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { parseTodayScope, TODAY_SCOPE_COOKIE } from "@/features/today/constants"
import { TodayView } from "@/features/today/today-view"
import { greetingFor, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Hoje" }

export default async function TodayPage() {
  const [tasks, events, clients, reviews, { records, items }, docs, finance, deals, posts, cookieStore] = await Promise.all([
    getTasks(),
    getEvents(),
    getClients(),
    getClientReviews(),
    getMeetingRecords(),
    getDocs(),
    getFinance(),
    getDeals(),
    getContentPosts(),
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
        meetingRecords={records}
        meetingItems={items}
        docs={docs}
        finance={finance}
        deals={deals}
        posts={posts}
        initialScope={parseTodayScope(cookieStore.get(TODAY_SCOPE_COOKIE)?.value)}
      />
    </TasksProvider>
  )
}
