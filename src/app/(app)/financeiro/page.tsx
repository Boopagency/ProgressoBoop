import type { Metadata } from "next"

import { parsePeriodParam, periodOf } from "@/features/clients/logic"
import { getFinance } from "@/features/finance/queries"
import { FinanceView } from "@/features/finance/finance-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Financeiro" }

export default async function FinancePage(props: PageProps<"/financeiro">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const period = parsePeriodParam(searchParams.mes) ?? periodOf(today)
  const { entries, recurrences } = await getFinance()

  return <FinanceView entries={entries} recurrences={recurrences} period={period} today={today} />
}
