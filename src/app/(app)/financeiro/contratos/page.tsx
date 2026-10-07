import type { Metadata } from "next"

import { ContractsView } from "@/features/finance/contracts-view"
import { getFinance } from "@/features/finance/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Contratos e custos · Financeiro" }

export default async function ContractsPage() {
  const data = await getFinance()
  return <ContractsView data={data} today={todayKey()} />
}
