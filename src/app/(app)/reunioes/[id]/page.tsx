import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getEvents } from "@/features/calendar/queries"
import {
  meetingEntry,
  previousRecords,
  recordDate,
  seriesSiblings,
} from "@/features/meetings/logic"
import { MeetingView } from "@/features/meetings/meeting-view"
import { getMeetingDetail, getMeetingRecords } from "@/features/meetings/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Reunião" }

export default async function MeetingPage(props: PageProps<"/reunioes/[id]">) {
  const { id } = await props.params
  if (!isUuid(id)) notFound()

  const [detail, tasks, events, { records, items }] = await Promise.all([
    getMeetingDetail(id),
    getTasks(),
    getEvents(),
    getMeetingRecords(),
  ])
  const event = detail ? events.find((candidate) => candidate.id === detail.record.event_id) : undefined
  if (!detail || !event) notFound()

  const eventById = new Map(events.map((candidate) => [candidate.id, candidate]))
  const date = recordDate(detail.record, event)
  const previous = previousRecords(event, date, records, eventById)
  const previousIds = new Set(previous.map((entry) => entry.record.id))

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <MeetingView
        key={detail.record.id}
        entry={{ ...meetingEntry(event, date, detail.record), record: detail.record }}
        transcript={detail.transcript}
        frozenAgenda={detail.agenda}
        items={items.filter((item) => item.meeting_id === id)}
        previous={previous}
        previousItems={items.filter((item) => previousIds.has(item.meeting_id))}
        siblings={seriesSiblings(event, date, records, events)}
      />
    </TasksProvider>
  )
}
