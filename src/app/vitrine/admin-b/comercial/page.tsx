"use client"

import { DealsView } from "@/features/deals/deals-view"
import { todayKey } from "@/lib/dates"

import { vbDeals } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** O Comercial de verdade (funil e lista), com negócios de exemplo. */
export default function VitrineCommercialPage() {
  const today = todayKey()
  return (
    <VitrineB active="/comercial">
      <DealsView deals={vbDeals(today)} today={today} />
    </VitrineB>
  )
}
