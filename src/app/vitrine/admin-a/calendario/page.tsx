"use client"

import { CalendarView } from "@/features/calendar/calendar-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../frame"
import { adminAEvents, adminAMeetings } from "../fixtures"

/** Calendário (semana e mês, `?visao=mes`) com dados de exemplo. */
export default function VitrineAdminACalendarPage() {
  const today = todayKey()
  return (
    <AdminAFrame active="/calendario" today={today}>
      <CalendarView events={adminAEvents(today)} meetingRecords={adminAMeetings(today).records} posts={[]} />
    </AdminAFrame>
  )
}
