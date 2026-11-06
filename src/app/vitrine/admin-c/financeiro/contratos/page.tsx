"use client"

import { ContractsView } from "@/features/finance/contracts-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrinePage() {
  const today = todayKey()
  return <ContractsView data={gestaoFinance(today)} today={today} />
}
