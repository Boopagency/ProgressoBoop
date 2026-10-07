import { isPeriod } from "@/features/clients/validation"
import { isDateKey } from "@/lib/dates"
import { isFinanceKind } from "@/lib/labels"
import type { DateKey, FinanceKind } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação do financeiro (Server Actions recebem dados de qualquer origem). */

export const DESCRIPTION_MAX = 200
export const CATEGORY_MAX = 60
export const NOTES_MAX = 2000
export const AMOUNT_MAX = 100_000_000_000

export interface EntryInput {
  kind: FinanceKind
  description: string
  amount_cents: number
  due_on: DateKey
  paid_on: DateKey | null
  category: string | null
  client_id: string | null
  project_id: string | null
  notes: string | null
}

export type EntryPatch = Partial<Omit<EntryInput, "kind">> & { skipped?: boolean }

export interface RecurrenceInput {
  kind: FinanceKind
  description: string
  amount_cents: number
  day_of_month: number
  category: string | null
  client_id: string | null
  project_id: string | null
  /** Primeiro e último mês (dia 1). */
  starts_on: DateKey
  ends_on: DateKey | null
  notes: string | null
}

export type RecurrencePatch = Partial<Omit<RecurrenceInput, "kind" | "starts_on">>

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** Campos comuns a lançamentos e recorrências. */
function parseCommon(input: Record<string, unknown>, patch: Record<string, unknown>): string | null {
  if ("description" in input) {
    const description = typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim() : ""
    if (!description) return "Descreva o lançamento."
    if (description.length > DESCRIPTION_MAX) return "Descrição muito longa."
    patch.description = description
  }
  if ("amount_cents" in input) {
    const amount = input.amount_cents
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > AMOUNT_MAX) {
      return "Valor inválido."
    }
    patch.amount_cents = amount
  }
  if ("category" in input) {
    if (input.category !== null && typeof input.category !== "string") return "Categoria inválida."
    const category = input.category?.replace(/\s+/g, " ").trim() ?? ""
    if (category.length > CATEGORY_MAX) return "Categoria muito longa."
    patch.category = category || null
  }
  if ("notes" in input) {
    if (input.notes !== null && typeof input.notes !== "string") return "Observação inválida."
    const notes = input.notes?.trim() ?? ""
    if (notes.length > NOTES_MAX) return "Observação muito longa."
    patch.notes = notes || null
  }
  for (const key of ["client_id", "project_id"] as const) {
    if (key in input) {
      if (input[key] !== null && !isUuid(input[key])) return "Vínculo inválido."
      patch[key] = input[key]
    }
  }
  return null
}

export function parseEntryPatch(raw: unknown): Parsed<EntryPatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: Record<string, unknown> = {}
  const error = parseCommon(input, patch)
  if (error) return { ok: false, error }
  if ("due_on" in input) {
    if (!isDateKey(input.due_on)) return { ok: false, error: "Vencimento inválido." }
    patch.due_on = input.due_on
  }
  if ("paid_on" in input) {
    if (input.paid_on !== null && !isDateKey(input.paid_on)) return { ok: false, error: "Data de pagamento inválida." }
    patch.paid_on = input.paid_on
  }
  if ("skipped" in input) {
    if (typeof input.skipped !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.skipped = input.skipped
  }
  return { ok: true, value: patch as EntryPatch }
}

export function parseEntryInput(raw: unknown): Parsed<EntryInput> {
  const input = record(raw)
  if (!input || !isFinanceKind(input.kind)) return { ok: false, error: "Escolha receita ou despesa." }
  const parsed = parseEntryPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.description) return { ok: false, error: "Descreva o lançamento." }
  if (!patch.amount_cents) return { ok: false, error: "Informe o valor." }
  if (!patch.due_on) return { ok: false, error: "Escolha o vencimento." }
  return {
    ok: true,
    value: {
      kind: input.kind,
      description: patch.description,
      amount_cents: patch.amount_cents,
      due_on: patch.due_on,
      paid_on: patch.paid_on ?? null,
      category: patch.category ?? null,
      client_id: patch.client_id ?? null,
      project_id: patch.project_id ?? null,
      notes: patch.notes ?? null,
    },
  }
}

export function parseRecurrencePatch(raw: unknown): Parsed<RecurrencePatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: Record<string, unknown> = {}
  const error = parseCommon(input, patch)
  if (error) return { ok: false, error }
  if ("day_of_month" in input) {
    const day = input.day_of_month
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) {
      return { ok: false, error: "Dia do vencimento inválido." }
    }
    patch.day_of_month = day
  }
  if ("ends_on" in input) {
    if (input.ends_on !== null && !isPeriod(input.ends_on)) return { ok: false, error: "Mês final inválido." }
    patch.ends_on = input.ends_on
  }
  return { ok: true, value: patch as RecurrencePatch }
}

export function parseRecurrenceInput(raw: unknown): Parsed<RecurrenceInput> {
  const input = record(raw)
  if (!input || !isFinanceKind(input.kind)) return { ok: false, error: "Escolha receita ou despesa." }
  if (!isPeriod(input.starts_on)) return { ok: false, error: "Mês inicial inválido." }
  const parsed = parseRecurrencePatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.description) return { ok: false, error: "Descreva o lançamento." }
  if (!patch.amount_cents) return { ok: false, error: "Informe o valor." }
  if (!patch.day_of_month) return { ok: false, error: "Escolha o dia do vencimento." }
  if (patch.ends_on && patch.ends_on < input.starts_on) return { ok: false, error: "O fim não pode ser antes do começo." }
  return {
    ok: true,
    value: {
      kind: input.kind,
      description: patch.description,
      amount_cents: patch.amount_cents,
      day_of_month: patch.day_of_month,
      category: patch.category ?? null,
      client_id: patch.client_id ?? null,
      project_id: patch.project_id ?? null,
      starts_on: input.starts_on,
      ends_on: patch.ends_on ?? null,
      notes: patch.notes ?? null,
    },
  }
}
