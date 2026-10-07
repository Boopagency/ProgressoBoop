import { isPeriod } from "@/features/clients/validation"
import { isDateKey } from "@/lib/dates"
import { accountKind, isFinanceAccount, isFinanceKind } from "@/lib/labels"
import type { DateKey, FinanceAccount, FinanceKind, FinanceSettings } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação do financeiro (Server Actions recebem dados de qualquer origem). */

export const DESCRIPTION_MAX = 200
export const CATEGORY_MAX = 60
export const NOTES_MAX = 2000
export const AMOUNT_MAX = 100_000_000_000

export interface EntryInput {
  kind: FinanceKind
  account: FinanceAccount
  description: string
  amount_cents: number
  fee_cents: number
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
  account: FinanceAccount
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

export type SettingsPatch = Partial<
  Pick<
    FinanceSettings,
    | "tax_rate_bps"
    | "tax_rate_confirmed"
    | "reserve_months"
    | "reserve_share_bps"
    | "reinvest_share_bps"
    | "partners"
    | "owner_draw_target_cents"
    | "opening_balance_cents"
    | "opening_on"
    | "contract_alert_days"
  >
>

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
  if ("account" in input) {
    if (!isFinanceAccount(input.account)) return "Escolha a categoria."
    patch.account = input.account
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
  if ("fee_cents" in input) {
    const fee = input.fee_cents
    if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 0 || fee > AMOUNT_MAX) {
      return { ok: false, error: "Taxa inválida." }
    }
    patch.fee_cents = fee
  }
  if (typeof patch.fee_cents === "number" && typeof patch.amount_cents === "number" && patch.fee_cents > patch.amount_cents) {
    return { ok: false, error: "A taxa não pode ser maior que o valor." }
  }
  return { ok: true, value: patch as EntryPatch }
}

/** A categoria precisa combinar com receita/despesa. */
function checkAccount(kind: FinanceKind, account: FinanceAccount | undefined): string | null {
  if (!account) return "Escolha a categoria."
  return accountKind(account) === kind ? null : "Essa categoria não combina com o tipo (receita ou despesa)."
}

/** Receita de cliente nasce com o cliente (a margem e o MRR por cliente dependem dele). */
function checkClient(account: FinanceAccount, clientId: string | null | undefined): string | null {
  return account === "client_revenue" && !clientId ? "Escolha o cliente desta receita." : null
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
  const accountError = checkAccount(input.kind, patch.account) ?? checkClient(patch.account!, patch.client_id)
  if (accountError) return { ok: false, error: accountError }
  return {
    ok: true,
    value: {
      kind: input.kind,
      account: patch.account!,
      description: patch.description,
      amount_cents: patch.amount_cents,
      fee_cents: patch.fee_cents ?? 0,
      due_on: patch.due_on,
      paid_on: patch.paid_on ?? null,
      category: patch.category ?? null,
      client_id: patch.client_id ?? null,
      project_id: patch.project_id ?? null,
      notes: patch.notes ?? null,
    },
  }
}

/** Inteiro dentro de um intervalo (os parâmetros vêm de campos de texto). */
function intIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

/** Premissas do financeiro (mesmos limites das colunas). */
export function parseSettingsPatch(raw: unknown): Parsed<SettingsPatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: SettingsPatch = {}
  const ranges = {
    tax_rate_bps: [0, 5000, "Alíquota entre 0% e 50%."],
    reserve_months: [0, 24, "Caixa mínimo entre 0 e 24 meses."],
    reserve_share_bps: [0, 10000, "Percentual do caixa entre 0% e 100%."],
    reinvest_share_bps: [0, 10000, "Percentual de reinvestimento entre 0% e 100%."],
    partners: [1, 20, "Número de sócios entre 1 e 20."],
    owner_draw_target_cents: [0, AMOUNT_MAX, "Alvo de pró-labore inválido."],
    opening_balance_cents: [-AMOUNT_MAX, AMOUNT_MAX, "Saldo inicial inválido."],
    contract_alert_days: [0, 365, "Aviso de fim de contrato entre 0 e 365 dias."],
  } as const
  for (const [key, [min, max, message]] of Object.entries(ranges) as [keyof typeof ranges, (typeof ranges)[keyof typeof ranges]][]) {
    if (!(key in input)) continue
    if (!intIn(input[key], min, max)) return { ok: false, error: message }
    patch[key] = input[key] as number
  }
  if ("tax_rate_confirmed" in input) {
    if (typeof input.tax_rate_confirmed !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.tax_rate_confirmed = input.tax_rate_confirmed
  }
  if ("opening_on" in input) {
    if (!isPeriod(input.opening_on)) return { ok: false, error: "Mês inicial inválido." }
    patch.opening_on = input.opening_on
  }
  const reserve = patch.reserve_share_bps
  const reinvest = patch.reinvest_share_bps
  if (reserve !== undefined && reinvest !== undefined && reserve + reinvest > 10000) {
    return { ok: false, error: "Caixa + reinvestimento não podem passar de 100%." }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nada para salvar." }
  return { ok: true, value: patch }
}

export interface ClosingInput {
  period: DateKey
  bank_balance_cents: number
  notes: string | null
}

/** Fechamento do mês: o saldo do extrato no último dia e uma observação. */
export function parseClosingInput(raw: unknown): Parsed<ClosingInput> {
  const input = record(raw)
  if (!input || !isPeriod(input.period)) return { ok: false, error: "Mês inválido." }
  if (!intIn(input.bank_balance_cents, -AMOUNT_MAX, AMOUNT_MAX)) return { ok: false, error: "Informe o saldo do extrato." }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    return { ok: false, error: "Observação inválida." }
  }
  const notes = typeof input.notes === "string" ? input.notes.trim() : ""
  if (notes.length > NOTES_MAX) return { ok: false, error: "Observação muito longa." }
  return { ok: true, value: { period: input.period, bank_balance_cents: input.bank_balance_cents, notes: notes || null } }
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
  const accountError = checkAccount(input.kind, patch.account) ?? checkClient(patch.account!, patch.client_id)
  if (accountError) return { ok: false, error: accountError }
  return {
    ok: true,
    value: {
      kind: input.kind,
      account: patch.account!,
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
