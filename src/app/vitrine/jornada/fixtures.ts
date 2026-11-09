import { EMPTY_FACTS, type JourneyFacts, type JourneyMark, type JourneyRecord } from "@/features/journey/logic"
import { addBusinessDays, addDaysToKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

import { VB_CLIENTS } from "../admin-b/fixtures"

/*
 * Jornadas de exemplo da vitrine, com os clientes do lote 2B em fases
 * diferentes (datas relativas a hoje): Café Aurora no onboarding social com
 * a análise atrasada e o tráfego na entrada; Vela Arquitetura na entrada com
 * os acessos atrasados; Studio Norte no ongoing; Clínica Lume com o contrato
 * acabando. Maré Surf Shop e Boop ficam fora da jornada.
 */

const id = (index: number) => `00000000-0000-4000-8000-0000000000b${index}`

const ownerOf = (clientId: string) => VB_CLIENTS.find((client) => client.id === clientId)?.owner_id ?? null
const nameOf = (clientId: string) => VB_CLIENTS.find((client) => client.id === clientId)?.name ?? "Cliente"

function record(
  index: number,
  clientId: string,
  patch: Partial<JourneyRecord> & Pick<JourneyRecord, "line" | "phase" | "phase_started_on">
): JourneyRecord {
  return {
    id: id(index),
    client_id: clientId,
    client_name: nameOf(clientId),
    client_active: true,
    owner_id: ownerOf(clientId),
    mode: "full",
    started_on: patch.phase_started_on,
    contract_ends_on: null,
    ended_on: null,
    marks: [],
    facts: EMPTY_FACTS,
    ...patch,
  }
}

const done = (step_key: string, round: string, day: DateKey, by = "u-bia"): JourneyMark => ({
  step_key,
  round,
  state: "done",
  note: null,
  marked_by: by,
  marked_at: `${day}T14:00:00.000-03:00`,
})

const facts = (patch: Partial<JourneyFacts>): JourneyFacts => ({ ...EMPTY_FACTS, ...patch })

export function vjJourneys(today: DateKey): JourneyRecord[] {
  const aurora = VB_CLIENTS[0]!.id
  const norte = VB_CLIENTS[1]!.id
  const vela = VB_CLIENTS[2]!.id
  const lume = VB_CLIENTS[3]!.id
  const month = today.slice(0, 7)

  const auroraOnboarding = addBusinessDays(today, -7)
  const auroraEntry = addBusinessDays(auroraOnboarding, -4)
  const velaEntry = addBusinessDays(today, -5)
  const trafficEntry = addBusinessDays(today, -1)
  const firstOfMonth = `${month}-01`

  return [
    record(1, aurora, {
      line: "social",
      phase: "onboarding",
      phase_started_on: auroraOnboarding,
      started_on: auroraEntry,
      contract_ends_on: addDaysToKey(today, 300),
      facts: facts({
        deal_won: auroraEntry,
        first_payment: addBusinessDays(auroraEntry, 2),
        owner_defined: true,
        portal_access: addBusinessDays(auroraEntry, 1),
        briefing_released: addBusinessDays(auroraOnboarding, 1),
        briefing_submitted: addBusinessDays(auroraOnboarding, 3),
        briefing_meeting: addBusinessDays(auroraOnboarding, 4),
        instagram_connected: addBusinessDays(auroraEntry, 2),
      }),
    }),
    record(2, aurora, {
      line: "traffic",
      phase: "entry",
      phase_started_on: trafficEntry,
      facts: facts({ deal_won: trafficEntry, owner_defined: true, portal_access: auroraEntry, first_payment: trafficEntry }),
      marks: [done("contract_signed", trafficEntry, trafficEntry)],
    }),
    record(3, vela, {
      line: "social",
      phase: "entry",
      phase_started_on: velaEntry,
      mode: "compact",
      facts: facts({ deal_won: velaEntry, owner_defined: true, first_payment: addBusinessDays(velaEntry, 1) }),
      marks: [done("contract_signed", velaEntry, addBusinessDays(velaEntry, 1), "u-jabez"), done("portal_access", velaEntry, addBusinessDays(velaEntry, 1), "u-jabez")],
    }),
    record(4, norte, {
      line: "social",
      phase: "ongoing",
      phase_started_on: "2026-06-01",
      started_on: "2026-04-14",
      facts: facts({ owner_defined: true, first_post: "2026-05-28" }),
      marks: [
        done("month_numbers", month, addDaysToKey(firstOfMonth, 2), "u-jabez"),
        done("next_themes", month, addDaysToKey(firstOfMonth, 3), "u-jabez"),
      ],
    }),
    record(5, lume, {
      line: "social",
      phase: "ongoing",
      phase_started_on: "2026-01-12",
      started_on: "2025-12-01",
      contract_ends_on: addDaysToKey(today, 21),
      facts: facts({ owner_defined: true, monthly_reviews: [month] }),
      marks: ["month_numbers", "next_themes", "themes_approval", "month_production", "pieces_ready", "pieces_approval"].map((key) =>
        done(key, month, addDaysToKey(firstOfMonth, 2))
      ),
    }),
  ]
}
