"use client"

import { periodOf } from "@/features/clients/logic"
import { DreView } from "@/features/finance/dre-view"
import { dreRangeOptions, resolveDreRange } from "@/features/finance/ranges"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrineDrePage() {
  const today = todayKey()
  const current = periodOf(today)
  const data = gestaoFinance(today)
  const range = resolveDreRange(undefined, data.settings.opening_on, current)
  return (
    <DreView
      data={data}
      today={today}
      periods={range.periods}
      rangeKey={range.key}
      options={dreRangeOptions(data.settings.opening_on, current, "/vitrine/admin-c/financeiro/dre")}
    />
  )
}
