"use client"

import { SettingsView } from "@/features/finance/settings-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrinePage() {
  const today = todayKey()
  return <SettingsView data={gestaoFinance(today)} today={today} />
}
