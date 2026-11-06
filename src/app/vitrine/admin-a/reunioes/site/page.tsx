"use client"

import { meetingEntry, previousRecords, recordDate, seriesSiblings } from "@/features/meetings/logic"
import { MeetingView } from "@/features/meetings/meeting-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../../frame"
import { adminADecisions, adminAEvents, adminAMeetings } from "../../fixtures"

/** Página da reunião (apresentação do site, hoje) com pauta, combinados e resumo de exemplo. */
export default function VitrineAdminAMeetingPage() {
  const today = todayKey()
  const events = adminAEvents(today)
  const { records, items } = adminAMeetings(today)
  const record = records.find((item) => item.id === "r-site")!
  const event = events.find((item) => item.id === record.event_id)!
  const eventById = new Map(events.map((item) => [item.id, item]))
  const date = recordDate(record, event)
  const previous = previousRecords(event, date, records, eventById)
  const previousIds = new Set(previous.map((entry) => entry.record.id))
  return (
    <AdminAFrame active="/reunioes" today={today}>
      <MeetingView
        entry={{ ...meetingEntry(event, date, record), record }}
        transcript={null}
        frozenAgenda={null}
        items={items.filter((item) => item.meeting_id === record.id)}
        previous={previous}
        previousItems={items.filter((item) => previousIds.has(item.meeting_id))}
        siblings={seriesSiblings(event, date, records, events)}
        clients={[]}
        clientReviews={[]}
        decisions={adminADecisions(today)}
      />
    </AdminAFrame>
  )
}
