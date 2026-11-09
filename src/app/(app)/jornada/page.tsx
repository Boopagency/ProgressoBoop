import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { JourneyView } from "@/features/journey/journey-view"
import { getJourneys } from "@/features/journey/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Jornada" }

export default async function JourneyPage(props: PageProps<"/jornada">) {
  const searchParams = await props.searchParams
  const state = await getJourneys()
  // Antes da migration, a tela não existe.
  if (!state.available) notFound()
  return <JourneyView journeys={state.journeys} today={todayKey()} initialMode={searchParams.ver === "lista" ? "list" : "board"} />
}
