"use client"

import { useSearchParams } from "next/navigation"

import { parsePeriodParam, periodOf } from "@/features/clients/logic"
import { FinanceView } from "@/features/finance/finance-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../fixtures"

export default function VitrineFinancePage() {
  const today = todayKey()
  const period = parsePeriodParam(useSearchParams().get("mes") ?? undefined) ?? periodOf(today)
  return <FinanceView data={gestaoFinance(today)} period={period} today={today} />
}
