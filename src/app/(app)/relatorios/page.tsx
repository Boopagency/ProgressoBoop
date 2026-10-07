import type { Metadata } from "next"

import { getFinance } from "@/features/finance/queries"
import { parsePeriodParams } from "@/features/metrics/periods"
import { ReportBuilder } from "@/features/reports/report-builder"
import { parseSections } from "@/features/reports/sections"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Relatórios" }

export default async function ReportsPage(props: PageProps<"/relatorios">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const { period, compare } = parsePeriodParams(searchParams, today)
  const finance = await getFinance()
  const client = Array.isArray(searchParams.cliente) ? searchParams.cliente[0] : searchParams.cliente

  return (
    <ReportBuilder
      today={today}
      openingOn={finance.settings.opening_on}
      initial={{
        kind: period.kind,
        anchor: period.range.start,
        compare,
        sections: parseSections(searchParams.secoes),
        clientId: isUuid(client) ? client : null,
      }}
    />
  )
}
