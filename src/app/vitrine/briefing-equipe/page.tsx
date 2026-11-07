"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { BriefingTab } from "@/features/briefing/briefing-tab"
import { immersionMeetingOptions } from "@/features/briefing/team-logic"
import { ClientView } from "@/features/clients/client-view"
import { DEFAULT_SETTINGS } from "@/features/finance/management"
import { todayKey } from "@/lib/dates"
import type { BriefingStatus } from "@/lib/types"

import { VB_CLIENTS, vbEvents } from "../admin-b/fixtures"
import { VitrineB } from "../admin-b/vitrine-b"
import { VB_BRIEFING_CLIENT, vbBriefing, vbFileUrl } from "./fixtures"

const STATES: Record<string, BriefingStatus | null> = {
  "nao-liberado": null,
  liberado: "not_started",
  preenchimento: "in_progress",
  enviado: "submitted",
  imersao: "immersion_done",
}

/**
 * A aba Briefing do Café Aurora com dados de exemplo. `?estado=` troca a
 * situação: nao-liberado, liberado, preenchimento, enviado (padrão), imersao.
 */
export default function VitrineBriefingTeamPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  )
}

function Page() {
  const params = useSearchParams()
  const today = todayKey()
  const client = VB_CLIENTS.find((item) => item.id === VB_BRIEFING_CLIENT)!
  const key = params.get("estado") ?? "enviado"
  const status = key in STATES ? STATES[key]! : "submitted"
  const briefing = status ? vbBriefing(today, status) : null
  const events = vbEvents(today)

  return (
    <VitrineB active="/clientes">
      <ClientView
        client={client}
        reviews={[]}
        period={`${today.slice(0, 7)}-01`}
        events={events}
        records={[]}
        docs={[]}
        templateDocs={[]}
        communications={[]}
        decisions={[]}
        finance={{ entries: [], recurrences: [], settings: DEFAULT_SETTINGS, closings: [] }}
        paymentReminders={true}
        deals={[]}
        posts={[]}
        ideas={[]}
        members={[]}
        files={[]}
        instagramCard={null}
        briefingTab={
          <BriefingTab
            clientId={client.id}
            clientName={client.name}
            defaults={{ brand_name: client.name, contact_name: "Marina Prado", region: "", instagram: "@aurora.cafe", site: "" }}
            briefing={briefing}
            meetings={immersionMeetingOptions(client.id, events, [], today, null)}
            today={today}
            fileUrl={vbFileUrl}
          />
        }
      />
    </VitrineB>
  )
}
