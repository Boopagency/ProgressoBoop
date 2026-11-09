import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"

import {
  findStep,
  isJourneyLine,
  isJourneyMode,
  isJourneyPhase,
  lineForService,
  type JourneyLine,
  type JourneyMode,
  type JourneyPhase,
} from "@/features/journey/catalog"
import {
  canSkip,
  evaluateJourney,
  journeyRound,
  parseJourneyRows,
  type JourneyMarkState,
  type JourneyRecord,
} from "@/features/journey/logic"
import { isDateKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações da jornada, com a sessão da pessoa (o RLS deixa só a equipe).
 * O banco confere a etapa da linha, o portão sem "não se aplica" e grava
 * quem e quando; aqui ficam a rodada, a fase que anda e as datas.
 */

const NOT_FOUND = { ok: false, error: "Essa jornada não existe mais." } as const

const DB_ERRORS: Record<string, string> = {
  client_not_found: "Esse cliente não existe mais.",
  gate_required: "Portão não pode ficar como “não se aplica”.",
  unknown_step: "Essa etapa não é desta linha.",
  journey_fixed: "O cliente e a linha da jornada não mudam.",
}

function failure(error: PostgrestError, message: string) {
  const known = DB_ERRORS[error.message]
  if (known) return { ok: false as const, error: known }
  if (error.code === "23505") return { ok: false as const, error: "Esse cliente já tem jornada nessa linha." }
  return dbFailure(error, message)
}

/** A jornada com as marcações e os dados (pela leitura agregada da equipe). */
export async function loadJourney(supabase: SupabaseServerClient, id: string): Promise<JourneyRecord | null> {
  if (!isUuid(id)) return null
  const { data, error } = await supabase.from("client_journeys").select("client_id").eq("id", id).maybeSingle()
  if (error || !data) return null
  const rows = await supabase.rpc("team_journeys", { p_client: data.client_id })
  if (rows.error) return null
  return parseJourneyRows(rows.data).find((record) => record.id === id) ?? null
}

/* ------------------------------------------------------------------ */
/* Iniciar                                                             */
/* ------------------------------------------------------------------ */

export interface StartJourneyInput {
  client_id: string
  line: JourneyLine
  phase: JourneyPhase
  mode: JourneyMode
  /** Começo da fase (padrão: hoje). */
  phase_started_on: DateKey
  contract_ends_on: DateKey | null
}

export function parseStartInput(input: unknown, today: DateKey): { ok: true; value: StartJourneyInput } | { ok: false; error: string } {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  if (!isUuid(value.client_id)) return { ok: false, error: "Escolha o cliente." }
  if (!isJourneyLine(value.line)) return { ok: false, error: "Escolha a linha de serviço." }
  if (!isJourneyPhase(value.phase)) return { ok: false, error: "Escolha a fase atual." }
  if (value.phase === "offboarding") return { ok: false, error: "A jornada começa na Entrada, no Onboarding, no Ongoing ou na Renovação." }
  const started = value.phase_started_on ?? today
  if (!isDateKey(started) || started > today) return { ok: false, error: "A data de começo da fase não pode ser no futuro." }
  const contract = value.contract_ends_on ?? null
  if (contract !== null && (!isDateKey(contract) || contract < started)) {
    return { ok: false, error: "O fim do contrato precisa ser depois do começo da fase." }
  }
  return {
    ok: true,
    value: {
      client_id: value.client_id,
      line: value.line,
      phase: value.phase,
      mode: isJourneyMode(value.mode) ? value.mode : "full",
      phase_started_on: started,
      contract_ends_on: contract,
    },
  }
}

/**
 * "Iniciar jornada": a linha nova do cliente na fase escolhida (clientes que
 * já rodam entram no ongoing). Se a linha já teve uma jornada encerrada, ela
 * recomeça (as marcações velhas ficam na rodada antiga).
 */
export async function insertJourney(
  supabase: SupabaseServerClient,
  input: unknown,
  today: DateKey
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseStartInput(input, today)
  if (!parsed.ok) return parsed
  const start = parsed.value
  const fields = {
    phase: start.phase,
    mode: start.line === "social" ? start.mode : ("full" as const),
    phase_started_on: start.phase_started_on,
    started_on: start.phase_started_on,
    contract_ends_on: start.contract_ends_on,
    ended_on: null,
  }

  const existing = await supabase
    .from("client_journeys")
    .select("id, ended_on")
    .eq("client_id", start.client_id)
    .eq("line", start.line)
    .maybeSingle()
  if (existing.error) return failure(existing.error, "Não foi possível iniciar a jornada.")
  if (existing.data) {
    if (!existing.data.ended_on) return { ok: false, error: "Esse cliente já tem jornada nessa linha." }
    const { error } = await supabase.from("client_journeys").update(fields).eq("id", existing.data.id)
    if (error) return failure(error, "Não foi possível iniciar a jornada.")
    return { ok: true, data: { id: existing.data.id } }
  }

  const { data, error } = await supabase
    .from("client_journeys")
    .insert({ client_id: start.client_id, line: start.line, ...fields })
    .select("id")
    .single()
  if (error) return failure(error, "Não foi possível iniciar a jornada.")
  return { ok: true, data: { id: data.id } }
}

/**
 * Negócio ganho no Comercial: começa a jornada na Entrada, na linha do
 * serviço vendido (site é projeto e não entra). Não atrapalha o ganho: se não
 * der (antes da migration, linha já com jornada), só fica no log.
 */
export async function startJourneyForWonDeal(
  supabase: SupabaseServerClient,
  dealId: string,
  clientId: string,
  today: DateKey
): Promise<void> {
  try {
    const deal = await supabase.from("deals").select("service").eq("id", dealId).maybeSingle()
    if (deal.error) throw new Error(deal.error.message)
    const line = lineForService(deal.data?.service ?? null)
    if (!line) return
    const existing = await supabase
      .from("client_journeys")
      .select("id, ended_on")
      .eq("client_id", clientId)
      .eq("line", line)
      .maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data && !existing.data.ended_on) return
    const result = await insertJourney(
      supabase,
      { client_id: clientId, line, phase: "entry", mode: "full", phase_started_on: today, contract_ends_on: null },
      today
    )
    if (!result.ok) throw new Error(result.error)
  } catch (error) {
    console.error(`[jornada] negócio ${dealId} ganho sem jornada: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/* ------------------------------------------------------------------ */
/* Marcar etapas e andar de fase                                       */
/* ------------------------------------------------------------------ */

const MARK_STATES: readonly JourneyMarkState[] = ["done", "not_applicable", "open"]

/** Fase que anda sozinha quando a última etapa fica pronta. */
const AUTO_ADVANCE: Partial<Record<JourneyPhase, JourneyPhase>> = { entry: "onboarding", onboarding: "ongoing" }

/**
 * Marca uma etapa da fase atual (feita, não se aplica ou reaberta), na rodada
 * de hoje. Se era o que faltava na Entrada ou no Onboarding, a fase anda.
 */
export async function markJourneyStep(
  supabase: SupabaseServerClient,
  input: unknown,
  today: DateKey
): Promise<ActionResult<{ advanced: JourneyPhase | null }>> {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const state = MARK_STATES.find((candidate) => candidate === value.state)
  if (!state || typeof value.step_key !== "string") return { ok: false, error: "Etapa inválida." }
  const note = typeof value.note === "string" && value.note.trim() ? value.note.trim().slice(0, 500) : null

  const record = await loadJourney(supabase, String(value.journey_id ?? ""))
  if (!record) return NOT_FOUND
  if (record.ended_on) return { ok: false, error: "Essa jornada já terminou." }
  const found = findStep(record.line, value.step_key)
  if (!found || found.phase !== record.phase) return { ok: false, error: "Essa etapa não é da fase atual." }
  if (state === "not_applicable" && !canSkip(found.step)) return { ok: false, error: "Portão não pode ficar como “não se aplica”." }

  const round = journeyRound(record.phase, record.phase_started_on, today)
  const { error } = await supabase
    .from("journey_marks")
    .upsert({ journey_id: record.id, step_key: found.step.key, round, state, note }, { onConflict: "journey_id,step_key,round" })
  if (error) return failure(error, "Não foi possível marcar a etapa.")

  const next = AUTO_ADVANCE[record.phase]
  if (!next || state === "open") return { ok: true, data: { advanced: null } }
  const updated = await loadJourney(supabase, record.id)
  if (!updated || !evaluateJourney(updated, today).complete) return { ok: true, data: { advanced: null } }
  const moved = await movePhase(supabase, record.id, next, today)
  if (!moved.ok) return moved
  return { ok: true, data: { advanced: next } }
}

async function movePhase(
  supabase: SupabaseServerClient,
  id: string,
  phase: JourneyPhase,
  today: DateKey,
  extra: { contract_ends_on?: DateKey | null } = {}
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("client_journeys")
    .update({ phase, phase_started_on: today, ...extra })
    .eq("id", id)
    .select("id")
  if (error) return failure(error, "Não foi possível mudar a fase.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

/**
 * Andar de fase pelo portão: Entrada e Onboarding com tudo pronto; o Ongoing
 * vai para a Renovação quando a equipe começa; a Saída pronta encerra a
 * jornada. A Renovação anda pela decisão do cliente (`decideJourneyRenewal`).
 */
export async function advanceJourneyPhase(
  supabase: SupabaseServerClient,
  id: string,
  today: DateKey
): Promise<ActionResult<{ phase: JourneyPhase | null }>> {
  const record = await loadJourney(supabase, id)
  if (!record) return NOT_FOUND
  if (record.ended_on) return { ok: false, error: "Essa jornada já terminou." }
  const status = evaluateJourney(record, today)

  if (record.phase === "renewal") return { ok: false, error: "Na renovação, registre a decisão do cliente." }
  if (record.phase === "ongoing") {
    const moved = await movePhase(supabase, id, "renewal", today)
    return moved.ok ? { ok: true, data: { phase: "renewal" } } : moved
  }
  if (!status.complete) {
    const missing = status.pending.length
    return { ok: false, error: `Ainda ${missing === 1 ? "falta 1 etapa" : `faltam ${missing} etapas`} nesta fase.` }
  }
  if (record.phase === "offboarding") {
    const ended = await closeJourney(supabase, id, today)
    return ended.ok ? { ok: true, data: { phase: null } } : ended
  }
  const next = AUTO_ADVANCE[record.phase]
  if (!next) return { ok: false, error: "Essa fase não anda por aqui." }
  const moved = await movePhase(supabase, id, next, today)
  return moved.ok ? { ok: true, data: { phase: next } } : moved
}

/** Renovação: renovou (volta para o ongoing, com o novo fim do contrato) ou não (vai para a saída). */
export async function decideJourneyRenewal(
  supabase: SupabaseServerClient,
  input: unknown,
  today: DateKey
): Promise<ActionResult<{ phase: JourneyPhase }>> {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const renewed = value.renewed === true
  const contract = value.contract_ends_on ?? null
  if (renewed && contract !== null && (!isDateKey(contract) || contract <= today)) {
    return { ok: false, error: "O novo fim do contrato precisa ser depois de hoje." }
  }
  const record = await loadJourney(supabase, String(value.journey_id ?? ""))
  if (!record) return NOT_FOUND
  if (record.phase !== "renewal" || record.ended_on) return { ok: false, error: "Essa jornada não está na renovação." }

  const round = journeyRound(record.phase, record.phase_started_on, today)
  const { error } = await supabase
    .from("journey_marks")
    .upsert(
      { journey_id: record.id, step_key: "renewal_decision", round, state: "done", note: renewed ? "Renovou" : "Não renovou" },
      { onConflict: "journey_id,step_key,round" }
    )
  if (error) return failure(error, "Não foi possível registrar a decisão.")
  const phase: JourneyPhase = renewed ? "ongoing" : "offboarding"
  const moved = await movePhase(supabase, record.id, phase, today, renewed ? { contract_ends_on: (contract as DateKey | null) ?? null } : {})
  return moved.ok ? { ok: true, data: { phase } } : moved
}

/** Modo do onboarding (só social) e fim do contrato. */
export async function patchJourney(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult> {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  if (!isUuid(value.journey_id)) return NOT_FOUND
  const patch: { mode?: JourneyMode; contract_ends_on?: DateKey | null } = {}
  if ("mode" in value) {
    if (!isJourneyMode(value.mode)) return { ok: false, error: "Modo inválido." }
    patch.mode = value.mode
  }
  if ("contract_ends_on" in value) {
    if (value.contract_ends_on !== null && !isDateKey(value.contract_ends_on)) return { ok: false, error: "Data inválida." }
    patch.contract_ends_on = value.contract_ends_on
  }
  if (Object.keys(patch).length === 0) return { ok: true, data: null }
  const { data, error } = await supabase.from("client_journeys").update(patch).eq("id", value.journey_id).select("id")
  if (error) return failure(error, "Não foi possível salvar a jornada.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

/** Encerrar a jornada (fim da saída, ou começou por engano). Pode recomeçar por "Iniciar jornada". */
export async function closeJourney(supabase: SupabaseServerClient, id: string, today: DateKey): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const { data, error } = await supabase
    .from("client_journeys")
    .update({ ended_on: today })
    .eq("id", id)
    .is("ended_on", null)
    .select("id")
  if (error) return failure(error, "Não foi possível encerrar a jornada.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}
