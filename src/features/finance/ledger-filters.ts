import { addPeriods, parsePeriodParam, periodParam } from "@/features/clients/logic"
import { itemStatus, type FinanceItem } from "@/features/finance/logic"
import { entryIssues } from "@/features/finance/management"
import { includesText } from "@/lib/text"
import { isFinanceAccount } from "@/lib/labels"
import type { DateKey, FinanceAccount, FinanceKind } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Filtros do extrato (aba Lançamentos), lidos da URL: é por eles que os
 * números do DRE, do mês e dos indicadores levam aos lançamentos de origem.
 */

export type LedgerStatus = "paid" | "open" | "overdue" | "skipped"

export const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  paid: "Pagos e recebidos",
  open: "Em aberto",
  overdue: "Vencidos",
  skipped: "Pulados",
}

const STATUS_PARAM: Record<string, LedgerStatus> = {
  pago: "paid",
  aberto: "open",
  atrasado: "overdue",
  pulado: "skipped",
}
const STATUS_TO_PARAM: Record<LedgerStatus, string> = { paid: "pago", open: "aberto", overdue: "atrasado", skipped: "pulado" }

export interface LedgerFilters {
  /** Primeiro e último mês (dia 1). */
  from: DateKey
  to: DateKey
  accounts: FinanceAccount[]
  clientId: string | null
  status: LedgerStatus | null
  kind: FinanceKind | null
  /** Só lançamentos com pendência de conferência. */
  issues: boolean
}

/** Até três anos de extrato numa tela. */
const MAX_MONTHS = 36

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

export function parseLedgerFilters(params: Record<string, unknown>, current: DateKey): LedgerFilters {
  const month = parsePeriodParam(first(params.mes))
  let from = parsePeriodParam(first(params.de))
  let to = parsePeriodParam(first(params.ate))
  const statusParam = first(params.situacao)
  const status = typeof statusParam === "string" ? (STATUS_PARAM[statusParam] ?? null) : null
  const issues = first(params.conferencia) === "1"
  if (month) {
    from = month
    to = month
  } else if (!from && !to) {
    // Vencidos e pendências olham o último ano; o resto, o mês atual.
    from = status === "overdue" || issues ? addPeriods(current, -11) : current
    to = current
  }
  from = from ?? to ?? current
  to = to ?? from
  if (to < from) [from, to] = [to, from]
  if (addPeriods(from, MAX_MONTHS - 1) < to) from = addPeriods(to, -(MAX_MONTHS - 1))
  const accountParam = first(params.conta)
  const accounts =
    typeof accountParam === "string" ? [...new Set(accountParam.split(",").filter(isFinanceAccount))] : []
  const clientParam = first(params.cliente)
  const kindParam = first(params.tipo)
  return {
    from,
    to,
    accounts,
    clientId: isUuid(clientParam) ? clientParam : null,
    status,
    kind: kindParam === "receita" ? "income" : kindParam === "despesa" ? "expense" : null,
    issues,
  }
}

/** Filtros → parâmetros da URL (o inverso de parseLedgerFilters). */
export function ledgerSearch(filters: LedgerFilters): string {
  const search = new URLSearchParams()
  if (filters.from === filters.to) search.set("mes", periodParam(filters.from))
  else {
    search.set("de", periodParam(filters.from))
    search.set("ate", periodParam(filters.to))
  }
  if (filters.accounts.length > 0) search.set("conta", filters.accounts.join(","))
  if (filters.clientId) search.set("cliente", filters.clientId)
  if (filters.status) search.set("situacao", STATUS_TO_PARAM[filters.status])
  if (filters.kind) search.set("tipo", filters.kind === "income" ? "receita" : "despesa")
  if (filters.issues) search.set("conferencia", "1")
  return search.toString()
}

/** Situação de um item para o filtro (vencido = em aberto com vencimento passado). */
export function ledgerStatusOf(item: FinanceItem, today: DateKey): LedgerStatus {
  const status = itemStatus(item, today)
  return status === "paid" ? "paid" : status === "skipped" ? "skipped" : status === "overdue" ? "overdue" : "open"
}

/** Aplica os filtros (e a busca por texto) aos itens do período. */
export function filterLedger(
  items: FinanceItem[],
  filters: LedgerFilters,
  today: DateKey,
  query: string,
  names: (item: FinanceItem) => string
): FinanceItem[] {
  const text = query.trim()
  return items.filter((item) => {
    if (filters.accounts.length > 0 && !filters.accounts.includes(item.account)) return false
    if (filters.clientId && item.client_id !== filters.clientId) return false
    if (filters.kind && item.kind !== filters.kind) return false
    if (filters.status) {
      const status = ledgerStatusOf(item, today)
      // "Em aberto" inclui os vencidos.
      if (filters.status === "open" ? status !== "open" && status !== "overdue" : status !== filters.status) return false
    }
    if (filters.issues && (!item.entry || entryIssues(item.entry).length === 0)) return false
    if (text && !includesText(`${item.description} ${item.category ?? ""} ${names(item)}`, text)) return false
    return true
  })
}

export interface LedgerTotals {
  /** Pagos: entradas brutas, saídas, taxas e o líquido. */
  paidIn: number
  paidOut: number
  fees: number
  net: number
  /** Em aberto (inclui vencidos), sem os pulados. */
  openIn: number
  openOut: number
}

export function ledgerTotals(items: FinanceItem[]): LedgerTotals {
  const totals: LedgerTotals = { paidIn: 0, paidOut: 0, fees: 0, net: 0, openIn: 0, openOut: 0 }
  for (const item of items) {
    if (item.skipped) continue
    if (item.paid_on) {
      if (item.kind === "income") totals.paidIn += item.amount_cents
      else totals.paidOut += item.amount_cents
      totals.fees += item.fee_cents
    } else if (item.kind === "income") totals.openIn += item.amount_cents
    else totals.openOut += item.amount_cents
  }
  totals.net = totals.paidIn - totals.paidOut - totals.fees
  return totals
}
