"use client"

import { meetingsOverview } from "@/features/meetings/logic"
import { MeetingsView } from "@/features/meetings/meetings-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../frame"
import { adminAEvents, adminAMeetings } from "../fixtures"

/** Lista de reuniões com dados de exemplo. */
export default function VitrineAdminAMeetingsPage() {
  const today = todayKey()
  const events = adminAEvents(today)
  const { records, items } = adminAMeetings(today)
  return (
    <AdminAFrame active="/reunioes" today={today}>
      <MeetingsView
        overview={meetingsOverview(events, records, today)}
        events={events}
        records={records}
        items={items}
        query=""
        searchHits={[]}
      />
    </AdminAFrame>
  )
}
