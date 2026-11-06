"use client"

import { useSearchParams } from "next/navigation"

import { periodOf } from "@/features/clients/logic"
import { parseLedgerFilters } from "@/features/finance/ledger-filters"
import { LedgerView } from "@/features/finance/ledger-view"
import { todayKey } from "@/lib/dates"

import { gestaoFinance } from "../../fixtures"

export default function VitrineLedgerPage() {
  const today = todayKey()
  const filters = parseLedgerFilters(Object.fromEntries(useSearchParams().entries()), periodOf(today))
  return <LedgerView data={gestaoFinance(today)} today={today} filters={filters} />
}
