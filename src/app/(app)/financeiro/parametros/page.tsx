import type { Metadata } from "next"

import { getFinance } from "@/features/finance/queries"
import { SettingsView } from "@/features/finance/settings-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Parâmetros · Financeiro" }

export default async function SettingsPage() {
  const data = await getFinance()
  return <SettingsView data={data} today={todayKey()} />
}
