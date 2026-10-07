import { isPeriod } from "@/features/clients/validation"
import { isDateKey } from "@/lib/dates"
import { isDealStage, isLeadSource } from "@/lib/labels"
import type { DateKey, DealStage, LeadSource } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação do comercial (Server Actions recebem dados de qualquer origem). */

export const TITLE_MAX = 200
export const COMPANY_MAX = 200
export const CONTACT_MAX = 120
export const EMAIL_MAX = 200
export const PHONE_MAX = 40
export const SERVICE_MAX = 60
export const NOTES_MAX = 5000
export const LOST_REASON_MAX = 500
const AMOUNT_MAX = 100_000_000_000

export interface DealInput {
  title: string
  client_id: string | null
  company: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  source: LeadSource
  service: string | null
  stage: DealStage
  owner_id: string | null
  recurring_cents: number
  one_time_cents: number
  term_months: number | null
  probability: number | null
  opened_on: DateKey
  expected_close_on: DateKey | null
  notes: string | null
}

export type DealPatch = Partial<DealInput> & { lost_reason?: string | null }

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** Texto opcional: espaços aparados, vazio vira null. */
function optionalText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false }
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length > max) return { ok: false }
  return { ok: true, value: text || null }
}

function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= AMOUNT_MAX
}

export function parseDealPatch(raw: unknown): Parsed<DealPatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: Record<string, unknown> = {}
  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, error: "Dê um nome ao negócio." }
    if (title.length > TITLE_MAX) return { ok: false, error: "Nome muito longo." }
    patch.title = title
  }
  const texts = [
    ["company", COMPANY_MAX, "Empresa muito longa."],
    ["contact_name", CONTACT_MAX, "Nome do contato muito longo."],
    ["contact_phone", PHONE_MAX, "Telefone muito longo."],
    ["service", SERVICE_MAX, "Frente muito longa."],
    ["lost_reason", LOST_REASON_MAX, "Motivo muito longo."],
  ] as const
  for (const [key, max, message] of texts) {
    if (!(key in input)) continue
    const parsed = optionalText(input[key], max)
    if (!parsed.ok) return { ok: false, error: message }
    patch[key] = parsed.value
  }
  if ("contact_email" in input) {
    const parsed = optionalText(input.contact_email, EMAIL_MAX)
    if (!parsed.ok || (parsed.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.value))) return { ok: false, error: "E-mail inválido." }
    patch.contact_email = parsed.value?.toLowerCase() ?? null
  }
  if ("notes" in input) {
    if (input.notes !== null && typeof input.notes !== "string") return { ok: false, error: "Observação inválida." }
    const notes = input.notes?.trim() ?? ""
    if (notes.length > NOTES_MAX) return { ok: false, error: "Observação muito longa." }
    patch.notes = notes || null
  }
  for (const key of ["client_id", "owner_id"] as const) {
    if (!(key in input)) continue
    if (input[key] !== null && !isUuid(input[key])) return { ok: false, error: "Vínculo inválido." }
    patch[key] = input[key]
  }
  if ("source" in input) {
    if (!isLeadSource(input.source)) return { ok: false, error: "Origem inválida." }
    patch.source = input.source
  }
  if ("stage" in input) {
    if (!isDealStage(input.stage)) return { ok: false, error: "Etapa inválida." }
    patch.stage = input.stage
  }
  for (const key of ["recurring_cents", "one_time_cents"] as const) {
    if (!(key in input)) continue
    if (!amount(input[key])) return { ok: false, error: "Valor inválido." }
    patch[key] = input[key]
  }
  if ("term_months" in input) {
    const term = input.term_months
    if (term !== null && (typeof term !== "number" || !Number.isInteger(term) || term < 1 || term > 120)) {
      return { ok: false, error: "Duração entre 1 e 120 meses." }
    }
    patch.term_months = term
  }
  if ("probability" in input) {
    const chance = input.probability
    if (chance !== null && (typeof chance !== "number" || !Number.isInteger(chance) || chance < 0 || chance > 100)) {
      return { ok: false, error: "Chance entre 0% e 100%." }
    }
    patch.probability = chance
  }
  if ("opened_on" in input) {
    if (!isDateKey(input.opened_on)) return { ok: false, error: "Data de chegada inválida." }
    patch.opened_on = input.opened_on
  }
  if ("expected_close_on" in input) {
    if (input.expected_close_on !== null && !isDateKey(input.expected_close_on)) return { ok: false, error: "Previsão inválida." }
    patch.expected_close_on = input.expected_close_on
  }
  return { ok: true, value: patch as DealPatch }
}

export function parseDealInput(raw: unknown): Parsed<DealInput> {
  const parsed = parseDealPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Dê um nome ao negócio." }
  if (!patch.opened_on) return { ok: false, error: "Informe quando o lead chegou." }
  const stage = patch.stage ?? "lead"
  if (stage === "won" || stage === "lost") return { ok: false, error: "Um negócio novo começa em aberto." }
  return {
    ok: true,
    value: {
      title: patch.title,
      client_id: patch.client_id ?? null,
      company: patch.company ?? null,
      contact_name: patch.contact_name ?? null,
      contact_email: patch.contact_email ?? null,
      contact_phone: patch.contact_phone ?? null,
      source: patch.source ?? "other",
      service: patch.service ?? null,
      stage,
      owner_id: patch.owner_id ?? null,
      recurring_cents: patch.recurring_cents ?? 0,
      one_time_cents: patch.one_time_cents ?? 0,
      term_months: patch.term_months ?? null,
      probability: patch.probability ?? null,
      opened_on: patch.opened_on,
      expected_close_on: patch.expected_close_on ?? null,
      notes: patch.notes ?? null,
    },
  }
}

export interface WinInput {
  /** Cliente existente (ou null para criar/encontrar pelo nome). */
  client_id: string | null
  client_name: string | null
  /** Contrato: dia do vencimento, mês de início e meses (null = sem prazo). Sem dia, não cria. */
  contract_day: number | null
  contract_starts_on: DateKey | null
  contract_months: number | null
  /** Vencimento da entrada pontual (null = não lança). */
  one_time_due_on: DateKey | null
  /** Nome do projeto (null = não cria). */
  project_name: string | null
}

export function parseWinInput(raw: unknown): Parsed<WinInput> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  if (input.client_id !== null && input.client_id !== undefined && !isUuid(input.client_id)) return { ok: false, error: "Cliente inválido." }
  const name = optionalText(input.client_name, 120)
  if (!name.ok) return { ok: false, error: "Nome do cliente muito longo." }
  const project = optionalText(input.project_name, 200)
  if (!project.ok) return { ok: false, error: "Nome do projeto muito longo." }
  const day = input.contract_day ?? null
  if (day !== null && (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31)) {
    return { ok: false, error: "Dia do vencimento entre 1 e 31." }
  }
  const starts = input.contract_starts_on ?? null
  if (day !== null && !isPeriod(starts)) return { ok: false, error: "Escolha o mês de início do contrato." }
  const months = input.contract_months ?? null
  if (months !== null && (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 120)) {
    return { ok: false, error: "Duração entre 1 e 120 meses." }
  }
  const due = input.one_time_due_on ?? null
  if (due !== null && !isDateKey(due)) return { ok: false, error: "Vencimento da entrada inválido." }
  return {
    ok: true,
    value: {
      client_id: (input.client_id as string | null | undefined) ?? null,
      client_name: name.value,
      contract_day: day as number | null,
      contract_starts_on: day === null ? null : (starts as DateKey),
      contract_months: day === null ? null : (months as number | null),
      one_time_due_on: due as DateKey | null,
      project_name: project.value,
    },
  }
}
