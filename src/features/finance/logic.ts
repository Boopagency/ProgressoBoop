import { addPeriods, periodOf } from "@/features/clients/logic"
import { daysBetween, monthRangeOf } from "@/lib/dates"
import type { DateKey, FinanceEntry, FinanceKind, FinanceRecurrence } from "@/lib/types"

/*
 * Regras do financeiro: funções puras, sem React.
 *
 * - Lançamento avulso: um registro em finance_entries.
 * - Recorrência (fee, assinatura): vale de starts_on até ends_on (meses). Cada
 *   mês é uma "ocorrência" que o app mostra sem gravar nada; o registro só
 *   nasce quando alguém mexe nela (marca como pago, muda o valor ou pula o
 *   mês). Igual às revisões de clientes.
 * - Um item pertence ao mês do vencimento.
 */

export interface FinanceItem {
  /** Id do lançamento, ou "r:<recorrência>:<mês>" para ocorrência ainda não gravada. */
  key: string
  entry: FinanceEntry | null
  recurrence: FinanceRecurrence | null
  kind: FinanceKind
  description: string
  amount_cents: number
  due_on: DateKey
  paid_on: DateKey | null
  skipped: boolean
  category: string | null
  client_id: string | null
  project_id: string | null
  /** Mês da ocorrência (só em itens de recorrência). */
  period: DateKey | null
}

export type FinanceStatus = "paid" | "overdue" | "pending" | "skipped"

/** Quantos meses para trás as recorrências ainda aparecem como "em atraso". */
export const OVERDUE_LOOKBACK_MONTHS = 12

function lastDayOfMonth(period: DateKey): number {
  return Number(monthRangeOf(period).end.slice(8, 10))
}

/** Vencimento da ocorrência: o dia da recorrência (ou o último dia do mês). */
export function occurrenceDue(recurrence: Pick<FinanceRecurrence, "day_of_month">, period: DateKey): DateKey {
  const day = Math.min(recurrence.day_of_month, lastDayOfMonth(period))
  return `${period.slice(0, 8)}${String(day).padStart(2, "0")}`
}

export function recurrenceActiveIn(recurrence: Pick<FinanceRecurrence, "starts_on" | "ends_on">, period: DateKey): boolean {
  return recurrence.starts_on <= period && (recurrence.ends_on === null || period <= recurrence.ends_on)
}

function fromEntry(entry: FinanceEntry, recurrences: Map<string, FinanceRecurrence>): FinanceItem {
  return {
    key: entry.id,
    entry,
    recurrence: entry.recurrence_id ? (recurrences.get(entry.recurrence_id) ?? null) : null,
    kind: entry.kind,
    description: entry.description,
    amount_cents: entry.amount_cents,
    due_on: entry.due_on,
    paid_on: entry.paid_on,
    skipped: entry.skipped,
    category: entry.category,
    client_id: entry.client_id,
    project_id: entry.project_id,
    period: entry.period,
  }
}

export function occurrenceKey(recurrenceId: string, period: DateKey): string {
  return `r:${recurrenceId}:${period}`
}

function fromRecurrence(recurrence: FinanceRecurrence, period: DateKey): FinanceItem {
  return {
    key: occurrenceKey(recurrence.id, period),
    entry: null,
    recurrence,
    kind: recurrence.kind,
    description: recurrence.description,
    amount_cents: recurrence.amount_cents,
    due_on: occurrenceDue(recurrence, period),
    paid_on: null,
    skipped: false,
    category: recurrence.category,
    client_id: recurrence.client_id,
    project_id: recurrence.project_id,
    period,
  }
}

export function itemStatus(item: Pick<FinanceItem, "paid_on" | "skipped" | "due_on">, today: DateKey): FinanceStatus {
  if (item.skipped) return "skipped"
  if (item.paid_on) return "paid"
  return item.due_on < today ? "overdue" : "pending"
}

/** Ocorrências já gravadas, para não aparecerem duas vezes. */
function materialized(entries: FinanceEntry[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.recurrence_id && entry.period)
      .map((entry) => occurrenceKey(entry.recurrence_id!, entry.period!))
  )
}

/** Itens com vencimento no mês: lançamentos gravados e ocorrências das recorrências. */
export function monthItems(entries: FinanceEntry[], recurrences: FinanceRecurrence[], period: DateKey): FinanceItem[] {
  const month = monthRangeOf(period)
  const byId = new Map(recurrences.map((recurrence) => [recurrence.id, recurrence]))
  const saved = materialized(entries)
  const items = entries
    .filter((entry) => entry.due_on >= month.start && entry.due_on <= month.end)
    .map((entry) => fromEntry(entry, byId))
  for (const recurrence of recurrences) {
    if (!recurrenceActiveIn(recurrence, period) || saved.has(occurrenceKey(recurrence.id, period))) continue
    items.push(fromRecurrence(recurrence, period))
  }
  return items.sort(compareItems)
}

/** Vencimento mais próximo primeiro; no empate, o maior valor. */
export function compareItems(a: FinanceItem, b: FinanceItem): number {
  if (a.due_on !== b.due_on) return a.due_on < b.due_on ? -1 : 1
  if (a.amount_cents !== b.amount_cents) return b.amount_cents - a.amount_cents
  return a.description.localeCompare(b.description, "pt-BR")
}

/**
 * Tudo o que venceu e não foi pago (nem pulado), de qualquer mês: lançamentos
 * gravados e ocorrências dos últimos 12 meses ainda não marcadas.
 */
export function overdueItems(entries: FinanceEntry[], recurrences: FinanceRecurrence[], today: DateKey): FinanceItem[] {
  const byId = new Map(recurrences.map((recurrence) => [recurrence.id, recurrence]))
  const saved = materialized(entries)
  const items = entries
    .filter((entry) => !entry.paid_on && !entry.skipped && entry.due_on < today)
    .map((entry) => fromEntry(entry, byId))
  const current = periodOf(today)
  for (const recurrence of recurrences) {
    for (let offset = OVERDUE_LOOKBACK_MONTHS; offset >= 0; offset -= 1) {
      const period = addPeriods(current, -offset)
      if (!recurrenceActiveIn(recurrence, period) || saved.has(occurrenceKey(recurrence.id, period))) continue
      const item = fromRecurrence(recurrence, period)
      if (item.due_on < today) items.push(item)
    }
  }
  return items.sort(compareItems)
}

export interface Totals {
  /** Receitas do período (sem as puladas) e quanto já entrou. */
  income: { expected: number; done: number }
  /** Despesas do período (sem as puladas) e quanto já saiu. */
  expense: { expected: number; done: number }
}

export function totalsOf(items: FinanceItem[]): Totals {
  const totals: Totals = { income: { expected: 0, done: 0 }, expense: { expected: 0, done: 0 } }
  for (const item of items) {
    if (item.skipped) continue
    const bucket = totals[item.kind]
    bucket.expected += item.amount_cents
    if (item.paid_on) bucket.done += item.amount_cents
  }
  return totals
}

/** Resultado do mês: o que entrou menos o que saiu (e o previsto). */
export function resultOf(totals: Totals): { done: number; expected: number } {
  return {
    done: totals.income.done - totals.expense.done,
    expected: totals.income.expected - totals.expense.expected,
  }
}

/** Os últimos meses (o mais antigo primeiro), com os totais de cada um. */
export function monthHistory(
  entries: FinanceEntry[],
  recurrences: FinanceRecurrence[],
  period: DateKey,
  count: number
): { period: DateKey; totals: Totals }[] {
  const months: { period: DateKey; totals: Totals }[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const month = addPeriods(period, -offset)
    months.push({ period: month, totals: totalsOf(monthItems(entries, recurrences, month)) })
  }
  return months
}

/* ------------------------------------------------------------------ */
/* Cliente e projeto                                                   */
/* ------------------------------------------------------------------ */

export interface ClientFinance {
  /** Soma das receitas recorrentes ativas neste mês (fee mensal). */
  monthlyIncome: number
  /** Recebimentos vencidos e não pagos. */
  overdue: { count: number; amount: number }
  /** Recebido no ano corrente. */
  receivedThisYear: number
}

/**
 * Recebimentos do cliente em atraso. Calcula sobre tudo e filtra no fim: uma
 * ocorrência gravada com outro cliente não pode "reaparecer" como pendente.
 */
export function clientOverdue(
  clientId: string,
  entries: FinanceEntry[],
  recurrences: FinanceRecurrence[],
  today: DateKey
): FinanceItem[] {
  return overdueItems(entries, recurrences, today).filter((item) => item.kind === "income" && item.client_id === clientId)
}

export function clientFinance(
  clientId: string,
  entries: FinanceEntry[],
  recurrences: FinanceRecurrence[],
  today: DateKey
): ClientFinance {
  const period = periodOf(today)
  const own = entries.filter((entry) => entry.client_id === clientId)
  const ownRecurrences = recurrences.filter((recurrence) => recurrence.client_id === clientId)
  const overdue = clientOverdue(clientId, entries, recurrences, today)
  return {
    monthlyIncome: ownRecurrences
      .filter((recurrence) => recurrence.kind === "income" && recurrenceActiveIn(recurrence, period))
      .reduce((sum, recurrence) => sum + recurrence.amount_cents, 0),
    overdue: { count: overdue.length, amount: overdue.reduce((sum, item) => sum + item.amount_cents, 0) },
    receivedThisYear: own
      .filter((entry) => entry.kind === "income" && entry.paid_on && entry.paid_on.slice(0, 4) === today.slice(0, 4))
      .reduce((sum, entry) => sum + entry.amount_cents, 0),
  }
}

/**
 * Lançamentos do projeto: os gravados e, das recorrências ligadas a ele, os
 * meses do começo até o prazo do projeto (ou até o mês atual).
 */
export function projectItems(
  projectId: string,
  entries: FinanceEntry[],
  recurrences: FinanceRecurrence[],
  today: DateKey,
  dueOn: DateKey | null
): FinanceItem[] {
  const ownRecurrences = recurrences.filter((recurrence) => recurrence.project_id === projectId)
  const byId = new Map(recurrences.map((recurrence) => [recurrence.id, recurrence]))
  const own = entries.filter((entry) => entry.project_id === projectId)
  // Todas as ocorrências gravadas (mesmo as que mudaram de projeto) não voltam como pendentes.
  const saved = materialized(entries)
  const items = own.map((entry) => fromEntry(entry, byId))
  const last = periodOf(dueOn && dueOn > today ? dueOn : today)
  const first = addPeriods(last, -35)
  for (const recurrence of ownRecurrences) {
    let period = recurrence.starts_on > first ? recurrence.starts_on : first
    for (let guard = 0; guard < 36 && period <= last; guard += 1) {
      if (recurrenceActiveIn(recurrence, period) && !saved.has(occurrenceKey(recurrence.id, period))) {
        items.push(fromRecurrence(recurrence, period))
      }
      period = addPeriods(period, 1)
    }
  }
  return items.sort(compareItems)
}

/** "Vence 10/10", "Venceu há 3 dias", "Vence hoje". */
export function dueLabel(due: DateKey, today: DateKey): { label: string; late: boolean } {
  const days = daysBetween(today, due)
  if (days === 0) return { label: "Vence hoje", late: false }
  if (days < 0) return { label: days === -1 ? "Venceu ontem" : `Venceu há ${-days} dias`, late: true }
  return { label: `Vence ${due.slice(8, 10)}/${due.slice(5, 7)}`, late: false }
}

export const INCOME_CATEGORIES = ["Fee mensal", "Projeto", "Extra"]
export const EXPENSE_CATEGORIES = ["Ferramentas", "Impostos", "Freelancer", "Pró-labore", "Contabilidade", "Marketing", "Outros"]
