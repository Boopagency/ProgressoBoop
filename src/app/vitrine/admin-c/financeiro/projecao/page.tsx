"use client"

import { ProjectionView } from "@/features/finance/projection-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrinePage() {
  const today = todayKey()
  return <ProjectionView data={gestaoFinance(today)} today={today} />
}
