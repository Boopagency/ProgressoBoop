"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { ClientView } from "@/features/clients/client-view"
import { DEFAULT_SETTINGS } from "@/features/finance/management"
import { JourneyBar } from "@/features/journey/journey-bar"
import { todayKey } from "@/lib/dates"

import { VB_CLIENTS, vbEvents, vbPosts, vbReviews } from "../../admin-b/fixtures"
import { VitrineB } from "../../admin-b/vitrine-b"
import { vjJourneys } from "../fixtures"

/**
 * A ficha do cliente com a barra da jornada. `?cliente=` escolhe: aurora
 * (padrão: onboarding social + tráfego na entrada), vela, norte, lume ou
 * mare (fora da jornada).
 */
export default function VitrineJourneyClientPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  )
}

const PICK: Record<string, number> = { aurora: 0, norte: 1, vela: 2, lume: 3, mare: 4 }

function Page() {
  const params = useSearchParams()
  const today = todayKey()
  const client = VB_CLIENTS[PICK[params.get("cliente") ?? "aurora"] ?? 0]!
  const journeys = vjJourneys(today).filter((journey) => journey.client_id === client.id)
  return (
    <VitrineB active="/clientes">
      <ClientView
        client={client}
        reviews={vbReviews(today)}
        period={`${today.slice(0, 7)}-01`}
        events={vbEvents(today)}
        records={[]}
        docs={[]}
        templateDocs={[]}
        communications={[]}
        decisions={[]}
        finance={{ entries: [], recurrences: [], settings: DEFAULT_SETTINGS, closings: [] }}
        paymentReminders={true}
        deals={[]}
        posts={vbPosts(today).filter((post) => post.client_id === client.id)}
        ideas={[]}
        members={[]}
        files={[]}
        instagramCard={null}
        journeyBar={<JourneyBar clientId={client.id} journeys={journeys} today={today} />}
      />
    </VitrineB>
  )
}
