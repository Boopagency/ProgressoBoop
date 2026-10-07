import type { Metadata } from "next"

import { periodOf } from "@/features/clients/logic"
import { parseLedgerFilters } from "@/features/finance/ledger-filters"
import { LedgerView } from "@/features/finance/ledger-view"
import { getFinance } from "@/features/finance/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Lançamentos · Financeiro" }

export default async function LedgerPage(props: PageProps<"/financeiro/lancamentos">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const filters = parseLedgerFilters(searchParams, periodOf(today))
  const data = await getFinance()

  return <LedgerView data={data} today={today} filters={filters} />
}
