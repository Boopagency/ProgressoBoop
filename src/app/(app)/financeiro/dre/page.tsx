import type { Metadata } from "next"

import { periodOf } from "@/features/clients/logic"
import { DreView } from "@/features/finance/dre-view"
import { getFinance } from "@/features/finance/queries"
import { dreRangeOptions, resolveDreRange } from "@/features/finance/ranges"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "DRE · Financeiro" }

export default async function DrePage(props: PageProps<"/financeiro/dre">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const current = periodOf(today)
  const data = await getFinance()
  const range = resolveDreRange(searchParams.ano, data.settings.opening_on, current)

  return (
    <DreView
      data={data}
      today={today}
      periods={range.periods}
      rangeKey={range.key}
      options={dreRangeOptions(data.settings.opening_on, current, "/financeiro/dre")}
    />
  )
}
