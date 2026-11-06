"use client"

import { periodOf } from "@/features/clients/logic"
import { ReportBuilder } from "@/features/reports/report-builder"
import { REPORT_SECTIONS } from "@/features/reports/sections"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../fixtures"
import { GestaoFrame } from "../gestao-frame"

export default function VitrineReportsPage() {
  const today = todayKey()
  return (
    <GestaoFrame active="/relatorios">
      <ReportBuilder
        today={today}
        openingOn={gestaoFinance(today).settings.opening_on}
        initial={{ kind: "month", anchor: periodOf(today), compare: "previous", sections: [...REPORT_SECTIONS], clientId: null }}
      />
    </GestaoFrame>
  )
}
