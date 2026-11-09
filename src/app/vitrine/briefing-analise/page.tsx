"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { BriefingTab } from "@/features/briefing/briefing-tab"
import { ClientView } from "@/features/clients/client-view"
import { DEFAULT_SETTINGS } from "@/features/finance/management"
import { todayKey } from "@/lib/dates"

import { VitrineB } from "../admin-b/vitrine-b"
import { DOCERIA_CLIENT, doceriaBriefing, type DoceriaState } from "./fixtures"

const STATES: readonly DoceriaState[] = ["pronta", "gerando", "parcial", "desatualizada", "falhou"]

/**
 * A análise do briefing da Doceria Flor de Açúcar na aba Briefing, com dados
 * de exemplo. `?estado=` troca a situação: pronta (padrão), gerando, parcial
 * (em preenchimento, com o botão), desatualizada e falhou.
 */
export default function VitrineBriefingAnalysisPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  )
}

function Page() {
  const params = useSearchParams()
  const today = todayKey()
  const raw = params.get("estado") as DoceriaState | null
  const state = raw && STATES.includes(raw) ? raw : "pronta"
  const client = DOCERIA_CLIENT

  return (
    <VitrineB active="/clientes">
      <ClientView
        client={client}
        reviews={[]}
        period={`${today.slice(0, 7)}-01`}
        events={[]}
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
            defaults={{ brand_name: "Flor de Açúcar", contact_name: "Ana Souza", region: "", instagram: "@flordeacucar.doces", site: "" }}
            briefing={doceriaBriefing(today, state)}
            meetings={[]}
            today={today}
            demo
          />
        }
      />
    </VitrineB>
  )
}
