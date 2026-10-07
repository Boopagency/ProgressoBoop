import type { Metadata } from "next"

import { parsePeriodParam, periodOf } from "@/features/clients/logic"
import { FinanceView } from "@/features/finance/finance-view"
import { getFinance } from "@/features/finance/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Financeiro" }

export default async function FinancePage(props: PageProps<"/financeiro">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const period = parsePeriodParam(searchParams.mes) ?? periodOf(today)
  const data = await getFinance()

  return <FinanceView data={data} period={period} today={today} />
}
