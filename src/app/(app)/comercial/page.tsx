import type { Metadata } from "next"

import { getDeals } from "@/features/deals/queries"
import { DealsView } from "@/features/deals/deals-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Comercial" }

export default async function CommercialPage() {
  const deals = await getDeals()
  return <DealsView deals={deals} today={todayKey()} />
}
