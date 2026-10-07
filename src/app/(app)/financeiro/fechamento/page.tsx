import type { Metadata } from "next"

import { ClosingView } from "@/features/finance/closing-view"
import { getFinance } from "@/features/finance/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Fechamento · Financeiro" }

export default async function ClosingPage() {
  const data = await getFinance()
  return <ClosingView data={data} today={todayKey()} />
}
