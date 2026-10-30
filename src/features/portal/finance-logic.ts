import type { DateKey, FinanceEntry, FinanceRecurrence } from "@/lib/types"

/*
 * Financeiro do cliente no portal: o que `portal_finance` devolve (só os
 * campos liberados) vira lançamentos e recorrências no formato do admin, para
 * as mesmas funções de `features/finance/logic.ts` calcularem os atrasos e as
 * ocorrências. Os campos internos ficam vazios. Função pura.
 */

export interface PortalFinanceData {
  /** "Avisar o cliente sobre pagamentos em atraso" (o aviso no portal). */
  reminders: boolean
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
}

export const EMPTY_PORTAL_FINANCE: PortalFinanceData = { reminders: false, entries: [], recurrences: [] }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function dateKey(value: unknown): DateKey | null {
  return typeof value === "string" && DATE_KEY.test(value) ? value : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function cents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : []
}

const STUB = { created_by: "", created_at: "", updated_at: "" }

function entry(clientId: string | null, row: Record<string, unknown>, fields: Partial<FinanceEntry>): FinanceEntry {
  return {
    id: text(row.id),
    kind: "income",
    account: "client_revenue",
    description: text(row.description),
    amount_cents: cents(row.amount_cents),
    fee_cents: 0,
    due_on: dateKey(row.due_on) ?? "",
    paid_on: dateKey(row.paid_on),
    skipped: false,
    category: null,
    client_id: clientId,
    project_id: null,
    recurrence_id: typeof row.recurrence_id === "string" ? row.recurrence_id : null,
    period: dateKey(row.period),
    notes: null,
    ...STUB,
    ...fields,
  }
}

/**
 * Lê o retorno de `portal_finance`. Os meses de recorrência gravados fora da
 * conta (pulados ou de outro cliente) entram como lançamentos pulados e sem
 * cliente: só servem para o mês não voltar como pendente.
 */
export function parsePortalFinance(clientId: string, raw: unknown): PortalFinanceData {
  if (typeof raw !== "object" || raw === null) return EMPTY_PORTAL_FINANCE
  const data = raw as Record<string, unknown>
  const entries = list(data.entries)
    .map((row) => entry(clientId, row, {}))
    .filter((row) => row.id && row.due_on)
  const taken = list(data.taken)
    .map((row, position) => entry(null, row, { id: `taken-${position}`, skipped: true, due_on: dateKey(row.period) ?? "" }))
    .filter((row) => row.recurrence_id && row.period)
  const recurrences = list(data.recurrences)
    .map(
      (row): FinanceRecurrence => ({
        id: text(row.id),
        kind: "income",
        account: "client_revenue",
        description: text(row.description),
        amount_cents: cents(row.amount_cents),
        day_of_month: typeof row.day_of_month === "number" ? row.day_of_month : 1,
        category: null,
        client_id: clientId,
        project_id: null,
        starts_on: dateKey(row.starts_on) ?? "",
        ends_on: dateKey(row.ends_on),
        notes: null,
        ...STUB,
      })
    )
    .filter((row) => row.id && row.starts_on)
  return { reminders: data.reminders === true, entries: [...entries, ...taken], recurrences }
}
