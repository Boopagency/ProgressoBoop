import type { Metadata } from "next"
import { cookies } from "next/headers"

import { DEALS_COLLAPSED_COOKIE, parseCollapsedStages } from "@/features/deals/constants"
import { getDeals } from "@/features/deals/queries"
import { DealsView } from "@/features/deals/deals-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Comercial" }

export default async function CommercialPage() {
  const [deals, cookieStore] = await Promise.all([getDeals(), cookies()])
  return (
    <DealsView
      deals={deals}
      today={todayKey()}
      initialCollapsed={parseCollapsedStages(cookieStore.get(DEALS_COLLAPSED_COOKIE)?.value)}
    />
  )
}
