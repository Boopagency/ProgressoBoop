"use client"

import { ClosingView } from "@/features/finance/closing-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrinePage() {
  const today = todayKey()
  return <ClosingView data={gestaoFinance(today)} today={today} />
}
