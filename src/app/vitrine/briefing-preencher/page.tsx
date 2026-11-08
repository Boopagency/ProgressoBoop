"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { BriefingTab } from "@/features/briefing/briefing-tab"
import { colorsOf } from "@/features/briefing/flow-logic"
import { immersionMeetingOptions, type TeamBriefingDetail } from "@/features/briefing/team-logic"
import { ClientView } from "@/features/clients/client-view"
import { DEFAULT_SETTINGS } from "@/features/finance/management"
import { addDaysToKey, todayKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

import { VB_CLIENTS, vbEvents } from "../admin-b/fixtures"
import { VitrineB } from "../admin-b/vitrine-b"
import { VB_BRIEFING_BLOCKS, VB_BRIEFING_CLIENT, VB_BRIEFING_ID, VB_BRIEFING_QUESTIONS, vbAnswer } from "../briefing-equipe/fixtures"
import { brandFiles, brandFileUrl, isVitrineBrand, VITRINE_BRANDS, type VitrineBrand } from "./marcas"

/** A pergunta "Logo, fontes, paleta ou manual" no formulário de exemplo. */
const IDENTITY_QUESTION = "q12"

/**
 * A aba Briefing de um cliente que a Boop já atende, com a identidade visual
 * de verdade preenchida pela Boop. `?marca=velmont|barbara`,
 * `?estado=preparando|liberado` e `?editar=1` (abre os campos da pergunta).
 */
export default function VitrineBriefingFillPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  )
}

function briefingFor(brand: VitrineBrand, today: DateKey, released: boolean): TeamBriefingDetail {
  const data = VITRINE_BRANDS[brand]
  const filledAt = `${addDaysToKey(today, -1)}T17:30:00.000Z`
  const boop = { filled_by_team: true, team_filled_at: filledAt, by_client: false, updated_at: filledAt }
  return {
    id: VB_BRIEFING_ID,
    status: released ? "not_started" : "preparing",
    due_on: addDaysToKey(today, 7),
    identification: { brand_name: data.name, contact_name: "", region: "", instagram: "", site: "" },
    released_at: `${today}T12:00:00.000Z`,
    started_at: null,
    submitted_at: null,
    immersion_at: null,
    document_sent_at: null,
    validated_at: null,
    last_seen_at: null,
    blocks: VB_BRIEFING_BLOCKS,
    questions: VB_BRIEFING_QUESTIONS,
    answers: [
      vbAnswer("q0", { ...boop, value: { brand_name: data.name } }),
      vbAnswer(IDENTITY_QUESTION, {
        ...boop,
        files: brandFiles(brand, `${VB_BRIEFING_CLIENT}/${VB_BRIEFING_ID}`),
        value: { extras: { palette: { colors: colorsOf(data.palette) } } },
      }),
    ],
    immersion: null,
  }
}

function Page() {
  const params = useSearchParams()
  const today = todayKey()
  const marca = params.get("marca")
  const brand: VitrineBrand = isVitrineBrand(marca) ? marca : "velmont"
  const released = params.get("estado") === "liberado"
  const base = VB_CLIENTS.find((item) => item.id === VB_BRIEFING_CLIENT)!
  const name = VITRINE_BRANDS[brand].name
  const client = { ...base, name, instagram_handle: null, instagram_bio: null, contact_name: null, contact_email: null, contact_phone: null, notes: null }
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
            key={`${brand}-${released}`}
            clientId={client.id}
            clientName={name}
            defaults={{ brand_name: name, contact_name: "", region: "", instagram: "", site: "" }}
            briefing={briefingFor(brand, today, released)}
            meetings={immersionMeetingOptions(client.id, events, [], today, null)}
            today={today}
            fileUrl={brandFileUrl}
            demo
            editing={params.get("editar") ? IDENTITY_QUESTION : undefined}
          />
        }
      />
    </VitrineB>
  )
}
