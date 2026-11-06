"use client"

import { DecisionsView } from "@/features/decisions/decisions-view"
import { todayKey } from "@/lib/dates"

import { gestaoDecisions, gestaoMeetings } from "../fixtures"
import { GestaoFrame } from "../gestao-frame"

export default function VitrineDecisionsPage() {
  const today = todayKey()
  return (
    <GestaoFrame active="/decisoes">
      <DecisionsView decisions={gestaoDecisions(today)} meetings={gestaoMeetings(today)} initialQuery="" />
    </GestaoFrame>
  )
}
