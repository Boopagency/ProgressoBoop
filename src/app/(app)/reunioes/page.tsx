import type { Metadata } from "next"

import { getEvents } from "@/features/calendar/queries"
import { meetingsOverview } from "@/features/meetings/logic"
import { MeetingsView } from "@/features/meetings/meetings-view"
import { getMeetingRecords, searchMeetingIds } from "@/features/meetings/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Reuniões" }

export default async function MeetingsPage(props: PageProps<"/reunioes">) {
  const searchParams = await props.searchParams
  const query = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : ""

  const [tasks, events, { records, items }, hits] = await Promise.all([
    getTasks(),
    getEvents(),
    getMeetingRecords(),
    query ? searchMeetingIds(query) : Promise.resolve(new Set<string>()),
  ])
  const today = todayKey()

  return (
    <TasksProvider tasks={tasks} today={today}>
      <MeetingsView
        overview={meetingsOverview(events, records, today)}
        events={events}
        records={records}
        items={items}
        query={query}
        searchHits={[...hits]}
      />
    </TasksProvider>
  )
}
