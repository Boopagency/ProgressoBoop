import {
  isJourneyLine,
  isJourneyMode,
  isJourneyPhase,
  JOURNEY_CATALOG,
  phaseDef,
  type JourneyActor,
  type JourneyLine,
  type JourneyMode,
  type JourneyPhase,
  type JourneyPhaseDef,
  type JourneyStepDef,
} from "@/features/journey/catalog"
import { addBusinessDays, addDaysToKey, daysBetween, isDateKey, toDateKey } from "@/lib/dates"
import type { DateKey, Timestamp } from "@/lib/types"

/*
 * Regras da jornada (funções puras): a rodada de cada fase, o prazo de cada
 * etapa, o que está feito (à mão ou pelos dados do sistema), a etapa atual,
 * há quantos dias ela está parada, o atraso e o que pede ação primeiro.
 *
 * O job dos avisos (`private.journey_pending_steps` na migration) faz a mesma
 * conta no banco; o teste `journey-sql.test.mjs` compara os dois lados.
 */

/** Feito, não se aplica ou reaberto (desfaz o feito, mesmo o automático). */
export type JourneyMarkState = "done" | "not_applicable" | "open"

export interface JourneyMark {
  step_key: string
  /** "aaaa-mm" no ongoing (o mês), "aaaa-mm-dd" nas outras fases (o começo da fase). */
  round: string
  state: JourneyMarkState
  note: string | null
  marked_by: string | null
  marked_at: Timestamp
}

/** O que os dados do sistema já dizem (ver `private.journey_facts`). */
export interface JourneyFacts {
  deal_won: DateKey | null
  first_payment: DateKey | null
  owner_defined: boolean
  portal_access: DateKey | null
  briefing_released: DateKey | null
  briefing_submitted: DateKey | null
  briefing_meeting: DateKey | null
  instagram_connected: DateKey | null
  first_post: DateKey | null
  /** Meses ("aaaa-mm") com a revisão mensal concluída. */
  monthly_reviews: string[]
  /** Fim do contrato pelas recorrências do Financeiro (todas com data de fim). */
  contract_ends_on: DateKey | null
}

export const EMPTY_FACTS: JourneyFacts = {
  deal_won: null,
  first_payment: null,
  owner_defined: false,
  portal_access: null,
  briefing_released: null,
  briefing_submitted: null,
  briefing_meeting: null,
  instagram_connected: null,
  first_post: null,
  monthly_reviews: [],
  contract_ends_on: null,
}

export interface JourneyRecord {
  id: string
  client_id: string
  client_name: string
  client_active: boolean
  /** Responsável da Boop pelo cliente (quem recebe os avisos). */
  owner_id: string | null
  line: JourneyLine
  phase: JourneyPhase
  mode: JourneyMode
  phase_started_on: DateKey
  started_on: DateKey
  /** Fim do contrato escrito pela equipe (vale mais que o do Financeiro). */
  contract_ends_on: DateKey | null
  /** A jornada terminou (saída concluída ou encerrada pela equipe). */
  ended_on: DateKey | null
  marks: JourneyMark[]
  facts: JourneyFacts
}

const DATE_FACTS = [
  "deal_won",
  "first_payment",
  "portal_access",
  "briefing_released",
  "briefing_submitted",
  "briefing_meeting",
  "instagram_connected",
  "first_post",
  "contract_ends_on",
] as const

/** Lê o jsonb de `journey_facts` (o que faltar fica vazio). */
export function parseFacts(raw: unknown): JourneyFacts {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const facts: JourneyFacts = { ...EMPTY_FACTS, monthly_reviews: [] }
  for (const key of DATE_FACTS) {
    const value = source[key]
    facts[key] = isDateKey(value) ? value : null
  }
  facts.owner_defined = source.owner_defined === true
  facts.monthly_reviews = Array.isArray(source.monthly_reviews)
    ? source.monthly_reviews.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}$/.test(value))
    : []
  return facts
}

const MARK_STATES = new Set(["done", "not_applicable", "open"])

/** Lê o jsonb de `team_journeys` (linhas fora do formato ficam de fora). */
export function parseJourneyRows(raw: unknown): JourneyRecord[] {
  if (!Array.isArray(raw)) return []
  const records: JourneyRecord[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.client_id !== "string") continue
    if (!isJourneyLine(row.line) || !isJourneyPhase(row.phase)) continue
    if (!isDateKey(row.phase_started_on) || !isDateKey(row.started_on)) continue
    const marks = Array.isArray(row.marks)
      ? row.marks.flatMap((mark): JourneyMark[] => {
          if (!mark || typeof mark !== "object") return []
          const value = mark as Record<string, unknown>
          if (typeof value.step_key !== "string" || typeof value.round !== "string" || !MARK_STATES.has(String(value.state))) return []
          return [
            {
              step_key: value.step_key,
              round: value.round,
              state: value.state as JourneyMarkState,
              note: typeof value.note === "string" ? value.note : null,
              marked_by: typeof value.marked_by === "string" ? value.marked_by : null,
              marked_at: typeof value.marked_at === "string" ? value.marked_at : new Date(0).toISOString(),
            },
          ]
        })
      : []
    records.push({
      id: row.id,
      client_id: row.client_id,
      client_name: typeof row.client_name === "string" ? row.client_name : "Cliente",
      client_active: row.client_active !== false,
      owner_id: typeof row.owner_id === "string" ? row.owner_id : null,
      line: row.line,
      phase: row.phase,
      mode: isJourneyMode(row.mode) ? row.mode : "full",
      phase_started_on: row.phase_started_on,
      started_on: row.started_on,
      contract_ends_on: isDateKey(row.contract_ends_on) ? row.contract_ends_on : null,
      ended_on: isDateKey(row.ended_on) ? row.ended_on : null,
      marks,
      facts: parseFacts(row.facts),
    })
  }
  return records
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

export function monthOf(day: DateKey): string {
  return day.slice(0, 7)
}

function lastDayOfMonth(month: string): number {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/** A rodada das marcações: o mês no ongoing; nas outras fases, o dia em que a fase começou. */
export function journeyRound(phase: JourneyPhase, phaseStartedOn: DateKey, today: DateKey): string {
  return phase === "ongoing" ? monthOf(today) : phaseStartedOn
}

/** O prazo-alvo da etapa na rodada de hoje. */
export function stepDueOn(step: JourneyStepDef, mode: JourneyMode, phaseStartedOn: DateKey, today: DateKey): DateKey {
  const target = step.target
  if (target.kind === "business_days") {
    return addBusinessDays(phaseStartedOn, mode === "compact" ? target.compact : target.full)
  }
  const month = monthOf(today)
  if (target.kind === "month_day") {
    return `${month}-${String(Math.min(target.day, lastDayOfMonth(month))).padStart(2, "0")}`
  }
  // O enésimo dia útil do mês: contado a partir do último dia do mês anterior.
  return addBusinessDays(addDaysToKey(`${month}-01`, -1), target.day)
}

const QUARTER_MONTHS = new Set(["03", "06", "09", "12"])

/**
 * A etapa vale nesta rodada? A trimestral só no último mês do trimestre; no
 * 1º mês do ongoing, o que venceria antes do começo da fase não conta.
 */
export function stepApplies(step: JourneyStepDef, phase: JourneyPhase, phaseStartedOn: DateKey, mode: JourneyMode, today: DateKey): boolean {
  if (step.quarterly && !QUARTER_MONTHS.has(today.slice(5, 7))) return false
  if (phase === "ongoing" && step.target.kind !== "business_days") {
    return stepDueOn(step, mode, phaseStartedOn, today) >= phaseStartedOn
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Etapas                                                              */
/* ------------------------------------------------------------------ */

/** O dado que marca a etapa sozinho: a data, `true` (sem data) ou nada. */
export function autoValue(step: JourneyStepDef, facts: JourneyFacts, round: string): DateKey | true | null {
  switch (step.auto) {
    case undefined:
      return null
    case "owner_defined":
      return facts.owner_defined ? true : null
    case "monthly_review":
      return facts.monthly_reviews.includes(round) ? true : null
    default:
      return facts[step.auto]
  }
}

export interface StepStatus {
  step: JourneyStepDef
  status: "done" | "not_applicable" | "pending"
  /** Quem marcou: a equipe (`manual`) ou os dados do sistema (`auto`). */
  source: "manual" | "auto" | null
  /** Quando ficou feita (ou "não se aplica"). */
  at: DateKey | null
  /** Quem da equipe marcou. */
  by: string | null
  note: string | null
  due: DateKey
  late: boolean
  /** Dias depois do prazo (0 se no prazo). */
  late_days: number
  /** Foi reaberta à mão (o automático não vale). */
  reopened: boolean
}

export function stepStatus(record: JourneyRecord, step: JourneyStepDef, round: string, today: DateKey): StepStatus {
  const due = stepDueOn(step, record.mode, record.phase_started_on, today)
  const mark = record.marks.find((candidate) => candidate.step_key === step.key && candidate.round === round)
  const base = { step, due, by: null, note: null, reopened: false }
  let resolved: Pick<StepStatus, "status" | "source" | "at" | "by" | "note" | "reopened">
  if (mark && mark.state !== "open") {
    resolved = {
      status: mark.state,
      source: "manual",
      at: toDateKey(mark.marked_at),
      by: mark.marked_by,
      note: mark.note,
      reopened: false,
    }
  } else {
    const auto = mark ? null : autoValue(step, record.facts, round)
    resolved = auto
      ? { status: "done", source: "auto", at: auto === true ? null : auto, by: null, note: null, reopened: false }
      : { status: "pending", source: null, at: null, by: mark?.marked_by ?? null, note: mark?.note ?? null, reopened: Boolean(mark) }
  }
  const late = resolved.status === "pending" && due < today
  return { ...base, ...resolved, late, late_days: late ? daysBetween(due, today) : 0 }
}

/* ------------------------------------------------------------------ */
/* A jornada inteira                                                   */
/* ------------------------------------------------------------------ */

/** Pede ação primeiro: atraso, fase pronta para andar, renovação chegando; depois quem age. */
export type JourneyAttention = "late" | "ready" | "renewal" | "boop" | "client" | "idle" | "ended"

const ATTENTION_RANK: Record<JourneyAttention, number> = {
  late: 0,
  ready: 1,
  renewal: 1,
  boop: 2,
  client: 3,
  idle: 4,
  ended: 5,
}

/** Antes do fim do contrato, quando a renovação começa (e o aviso sai). */
export const RENEWAL_NOTICE_DAYS = 30

export interface JourneyStatus {
  record: JourneyRecord
  def: JourneyPhaseDef
  round: string
  /** As etapas da fase que valem nesta rodada, na ordem. */
  steps: StepStatus[]
  pending: StepStatus[]
  /** A primeira etapa que falta. */
  current: StepStatus | null
  done: number
  total: number
  /** Desde quando a etapa atual está parada. */
  since: DateKey
  days_in_step: number
  late: boolean
  late_days: number
  /** Tudo feito ou "não se aplica" (os portões feitos). */
  complete: boolean
  /** A fase seguinte, quando ela anda sozinha (entrada e onboarding). */
  next: JourneyPhase | null
  contract_ends_on: DateKey | null
  /** Dias até o fim do contrato (negativo: já passou). */
  contract_days: number | null
  waiting_on: JourneyActor | null
  attention: JourneyAttention
  rank: number
}

/** A fase que vem depois, quando o avanço é pelos portões. */
export function nextPhase(phase: JourneyPhase): JourneyPhase | null {
  if (phase === "entry") return "onboarding"
  if (phase === "onboarding") return "ongoing"
  if (phase === "ongoing") return "renewal"
  return null
}

export function contractEnd(record: Pick<JourneyRecord, "contract_ends_on" | "facts">): DateKey | null {
  return record.contract_ends_on ?? record.facts.contract_ends_on
}

export function evaluateJourney(record: JourneyRecord, today: DateKey): JourneyStatus {
  const def = phaseDef(record.line, record.phase)
  const round = journeyRound(record.phase, record.phase_started_on, today)
  const steps = def.steps
    .filter((step) => stepApplies(step, record.phase, record.phase_started_on, record.mode, today))
    .map((step) => stepStatus(record, step, round, today))
  const pending = steps.filter((step) => step.status === "pending")
  const current = pending[0] ?? null

  // A etapa atual está parada desde o começo da rodada ou desde a última
  // etapa anterior a ela que ficou pronta.
  const roundStart = record.phase === "ongoing" ? maxKey(`${round}-01`, record.phase_started_on) : record.phase_started_on
  let since = roundStart
  if (current) {
    for (const step of steps) {
      if (step === current) break
      if (step.at && step.at > since && step.at <= today) since = step.at
    }
  }
  since = since > today ? today : since

  const contractEndsOn = contractEnd(record)
  const contractDays = contractEndsOn ? daysBetween(today, contractEndsOn) : null
  const complete = pending.length === 0
  const auto = record.phase === "entry" || record.phase === "onboarding"

  let attention: JourneyAttention
  if (record.ended_on) attention = "ended"
  else if (current?.late) attention = "late"
  else if (complete && (auto || record.phase === "offboarding")) attention = "ready"
  else if (record.phase === "ongoing" && contractDays !== null && contractDays <= RENEWAL_NOTICE_DAYS) attention = "renewal"
  else if (current) attention = current.step.actor
  else attention = "idle"

  const daysInStep = daysBetween(since, today)
  return {
    record,
    def,
    round,
    steps,
    pending,
    current,
    done: steps.length - pending.length,
    total: steps.length,
    since,
    days_in_step: daysInStep,
    late: Boolean(current?.late),
    late_days: current?.late_days ?? 0,
    complete,
    next: auto ? nextPhase(record.phase) : null,
    contract_ends_on: contractEndsOn,
    contract_days: contractDays,
    waiting_on: current?.step.actor ?? null,
    attention,
    // Dentro do mesmo grupo, o mais atrasado e o parado há mais tempo primeiro.
    rank: ATTENTION_RANK[attention] * 100000 - Math.min(current?.late_days ?? 0, 9999) * 10 - Math.min(daysInStep, 9),
  }
}

function maxKey(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b
}

/** Pede ação primeiro; empate pelo parado há mais tempo e pelo nome do cliente. */
export function sortByAttention(items: JourneyStatus[]): JourneyStatus[] {
  return [...items].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.days_in_step - a.days_in_step ||
      a.record.client_name.localeCompare(b.record.client_name, "pt-BR")
  )
}

/** Pode marcar "não se aplica"? Portão não. */
export function canSkip(step: JourneyStepDef): boolean {
  return !step.gate
}

/** As linhas de um cliente que ainda não têm jornada. */
export function missingLines(records: Pick<JourneyRecord, "line">[]): JourneyLine[] {
  return (Object.keys(JOURNEY_CATALOG) as JourneyLine[]).filter((line) => !records.some((record) => record.line === line))
}

/** "há 3 dias", "hoje". */
export function daysLabel(count: number): string {
  if (count <= 0) return "desde hoje"
  if (count === 1) return "há 1 dia"
  return `há ${count} dias`
}

export function lateLabel(count: number): string {
  return count === 1 ? "1 dia de atraso" : `${count} dias de atraso`
}
