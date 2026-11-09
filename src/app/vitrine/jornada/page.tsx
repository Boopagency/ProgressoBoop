"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { JourneyView } from "@/features/journey/journey-view"
import { todayKey } from "@/lib/dates"

import { VitrineB } from "../admin-b/vitrine-b"
import { vjJourneys } from "./fixtures"

/** A tela Jornada com clientes de exemplo. `?ver=lista` abre a lista. */
export default function VitrineJourneyPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  )
}

function Page() {
  const params = useSearchParams()
  const today = todayKey()
  return (
    <VitrineB active="/jornada">
      <JourneyView journeys={vjJourneys(today)} today={today} initialMode={params.get("ver") === "lista" ? "list" : "board"} />
    </VitrineB>
  )
}
