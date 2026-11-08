"use client"

import { useParams } from "next/navigation"

import { BriefingDetailView } from "@/features/briefing/briefing-detail"
import { briefingDefaults } from "@/features/briefing/central-logic"
import { immersionMeetingOptions } from "@/features/briefing/team-logic"
import { todayKey } from "@/lib/dates"

import { vbEvents } from "../../admin-b/fixtures"
import { VitrineB } from "../../admin-b/vitrine-b"
import { vbBriefing, vbFileUrl } from "../../briefing-equipe/fixtures"
import { vbCentralClients } from "../fixtures"

/**
 * Um briefing aberto pela central de exemplo: o nome e o status são do
 * cliente da lista; as respostas, as do Café Aurora.
 */
export default function VitrineBriefingCentralDetailPage() {
  const { id } = useParams<{ id: string }>()
  const today = todayKey()
  const clients = vbCentralClients(today)
  const client = clients.find((item) => item.id === id) ?? clients[0]!
  const briefing = client.briefing ? { ...vbBriefing(today, client.briefing.status), due_on: client.briefing.due_on } : null
  const events = vbEvents(today)

  return (
    <VitrineB active="/briefing">
      <BriefingDetailView
        client={client}
        defaults={briefingDefaults(client)}
        briefing={briefing}
        meetings={immersionMeetingOptions(client.id, events, [], today, null)}
        today={today}
        basePath="/vitrine/briefing-central"
        fileUrl={vbFileUrl}
      />
    </VitrineB>
  )
}
