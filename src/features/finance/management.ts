import { addPeriods, periodOf } from "@/features/clients/logic"
import {
  fromEntry,
  fromRecurrence,
  monthItems,
  occurrenceDue,
  occurrenceKey,
  overdueItems,
  recurrenceActiveIn,
  type FinanceItem,
} from "@/features/finance/logic"
import { formatMoneyShort } from "@/features/finance/money"
import { addDaysToKey, daysBetween, formatMonthYear, monthRangeOf, type DateRange } from "@/lib/dates"
import type {
  DateKey,
  FinanceAccount,
  FinanceClosing,
  FinanceEntry,
  FinanceRecurrence,
  FinanceSettings,
} from "@/lib/types"

/*
 * Gestão financeira: a lógica da planilha "Financeiro - Boop", em funções
 * puras.
 *
 * - DRE no regime de caixa, como a planilha: um mês passado mostra o que foi
 *   recebido e pago nele (realizado); o mês atual soma o realizado e o que
 *   ainda vence nele; meses futuros mostram o previsto (contratos, custos
 *   fixos e lançamentos já agendados). Mês fechado = realizado conferido.
 * - Imposto: provisão pela alíquota sobre a receita bruta (o DAS pago fica
 *   fora do DRE). Taxas do gateway: as cobradas (realizado) ou a taxa média
 *   histórica sobre a receita prevista.
 * - Divisão do resultado: negativo → nada é distribuído; caixa abaixo do
 *   mínimo → tudo para o caixa; mínimo atingido → caixa / reinvestimento /
 *   pró-labore.
 * - Valores sempre em centavos (inteiros) e positivos; o sinal vem da linha.
 */

export interface FinanceData {
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
  settings: FinanceSettings
  closings: FinanceClosing[]
}

/** Contas que somam como receita bruta no DRE. */
export const REVENUE_ACCOUNTS: readonly FinanceAccount[] = ["client_revenue", "other_revenue"]

/** Premissas da planilha, para quando os parâmetros ainda não foram lidos. */
export const DEFAULT_SETTINGS: FinanceSettings = {
  tax_rate_bps: 600,
  tax_rate_confirmed: false,
  reserve_months: 3,
  reserve_share_bps: 2000,
  reinvest_share_bps: 1000,
  partners: 3,
  owner_draw_target_cents: 500000,
  opening_balance_cents: 0,
  opening_on: "2026-09-01",
  contract_alert_days: 30,
  updated_by: null,
  updated_at: "2026-10-07T00:00:00.000Z",
}

export interface FinanceIndex {
  data: FinanceData
  today: DateKey
  /** Mês atual (dia 1). */
  current: DateKey
  byRecurrence: Map<string, FinanceRecurrence>
  /** Ocorrências gravadas: "r:<recorrência>:<mês>" → lançamento. */
  occurrences: Map<string, FinanceEntry>
  closed: Set<DateKey>
  /** Alíquota de imposto (fração). */
  taxRate: number
  /** Taxa média do gateway sobre a receita de clientes (fração). */
  gatewayRate: number
}

const fraction = (bps: number) => bps / 10000

/** Arredonda centavos (as provisões são percentuais de valores inteiros). */
const cents = (value: number) => Math.round(value)

export function indexFinance(data: FinanceData, today: DateKey): FinanceIndex {
  const occurrences = new Map<string, FinanceEntry>()
  for (const entry of data.entries) {
    if (entry.recurrence_id && entry.period) occurrences.set(occurrenceKey(entry.recurrence_id, entry.period), entry)
  }
  return {
    data,
    today,
    current: periodOf(today),
    byRecurrence: new Map(data.recurrences.map((recurrence) => [recurrence.id, recurrence])),
    occurrences,
    closed: new Set(data.closings.map((closing) => closing.period)),
    taxRate: fraction(data.settings.tax_rate_bps),
    gatewayRate: gatewayRate(data.entries, today),
  }
}

/**
 * Taxa média do gateway: taxas ÷ valor bruto das receitas de cliente recebidas
 * nos últimos 12 meses (igual à planilha). Sem histórico, zero.
 */
export function gatewayRate(entries: FinanceEntry[], today: DateKey): number {
  const since = addPeriods(periodOf(today), -11)
  let gross = 0
  let fees = 0
  for (const entry of entries) {
    if (entry.account !== "client_revenue" || !entry.paid_on || entry.skipped || entry.paid_on < since) continue
    gross += entry.amount_cents
    fees += entry.fee_cents
  }
  return gross > 0 ? fees / gross : 0
}

function inMonth(day: DateKey | null, period: DateKey): boolean {
  return day !== null && day.slice(0, 7) === period.slice(0, 7)
}

/** Lançamentos pagos no mês (regime de caixa). */
export function paidIn(index: FinanceIndex, period: DateKey): FinanceItem[] {
  return index.data.entries
    .filter((entry) => !entry.skipped && inMonth(entry.paid_on, period))
    .map((entry) => fromEntry(entry, index.byRecurrence))
}

/** Itens com vencimento no mês ainda não pagos (nem pulados). */
export function pendingIn(index: FinanceIndex, period: DateKey): FinanceItem[] {
  return monthItems(index.data.entries, index.data.recurrences, period).filter((item) => !item.paid_on && !item.skipped)
}

/**
 * Extrato de um período, no mesmo critério do DRE: o que foi pago em cada mês
 * e, do que não foi pago, o que vence nele (pulados aparecem riscados).
 */
export function ledgerItems(index: FinanceIndex, periods: DateKey[]): FinanceItem[] {
  const items: FinanceItem[] = []
  for (const period of periods) {
    for (const entry of index.data.entries) {
      if (inMonth(entry.paid_on, period)) items.push(fromEntry(entry, index.byRecurrence))
    }
    for (const item of monthItems(index.data.entries, index.data.recurrences, period)) {
      if (!item.paid_on) items.push(item)
    }
  }
  return items.sort((a, b) => {
    const dayA = a.paid_on ?? a.due_on
    const dayB = b.paid_on ?? b.due_on
    if (dayA !== dayB) return dayA < dayB ? -1 : 1
    return b.amount_cents - a.amount_cents
  })
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

/** Fechado (conferido), realizado (mês passado), atual (realizado + a vencer) ou previsto. */
export type DreStatus = "closed" | "realized" | "current" | "forecast"

export interface DreMonth {
  period: DateKey
  status: DreStatus
  /** Receita bruta (receitas de cliente + outras receitas). */
  revenue: number
  clientRevenue: number
  otherRevenue: number
  /** Provisão de imposto pela alíquota. */
  tax: number
  /** Taxas do gateway. */
  fees: number
  directCosts: number
  /** Margem de contribuição = receita − imposto − taxas − custos diretos. */
  contribution: number
  fixedCosts: number
  otherExpenses: number
  /** Resultado do mês = margem de contribuição − custos fixos − outras despesas. */
  result: number
  /** Resultado ÷ receita; null sem receita. */
  margin: number | null
  contributionMargin: number | null
  /** Movimentos de caixa fora do DRE. */
  ownerContributions: number
  taxPaid: number
  ownerDraws: number
  reinvestments: number
  /** Do valor da receita, quanto já entrou (o resto é previsto). */
  realizedRevenue: number
}

export function dreStatus(index: FinanceIndex, period: DateKey): DreStatus {
  if (index.closed.has(period)) return "closed"
  if (period < index.current) return "realized"
  return period === index.current ? "current" : "forecast"
}

/**
 * DRE de um mês. Com `realized`, só o que já foi pago (sem o que ainda vence):
 * é o "realizado até hoje" das metas.
 */
export function dreMonth(index: FinanceIndex, period: DateKey, options: { realized?: boolean } = {}): DreMonth {
  const status = dreStatus(index, period)
  const realized = paidIn(index, period)
  const pending = !options.realized && (status === "current" || status === "forecast") ? pendingIn(index, period) : []
  const sums = new Map<FinanceAccount, number>()
  for (const item of [...realized, ...pending]) {
    sums.set(item.account, (sums.get(item.account) ?? 0) + item.amount_cents)
  }
  const sum = (account: FinanceAccount) => sums.get(account) ?? 0
  const clientRevenue = sum("client_revenue")
  const otherRevenue = sum("other_revenue")
  const revenue = clientRevenue + otherRevenue
  const pendingRevenue = pending
    .filter((item) => REVENUE_ACCOUNTS.includes(item.account))
    .reduce((total, item) => total + item.amount_cents, 0)
  const fees = realized.reduce((total, item) => total + item.fee_cents, 0) + cents(pendingRevenue * index.gatewayRate)
  const tax = cents(revenue * index.taxRate)
  const directCosts = sum("direct_cost")
  const contribution = revenue - tax - fees - directCosts
  const fixedCosts = sum("fixed_cost")
  const otherExpenses = sum("other_expense")
  const result = contribution - fixedCosts - otherExpenses
  return {
    period,
    status,
    revenue,
    clientRevenue,
    otherRevenue,
    tax,
    fees,
    directCosts,
    contribution,
    fixedCosts,
    otherExpenses,
    result,
    margin: revenue > 0 ? result / revenue : null,
    contributionMargin: revenue > 0 ? contribution / revenue : null,
    ownerContributions: sum("owner_contribution"),
    taxPaid: sum("tax"),
    ownerDraws: sum("owner_draw"),
    reinvestments: sum("reinvestment"),
    realizedRevenue: revenue - pendingRevenue,
  }
}

/** Meses seguidos a partir de `from` (dia 1). */
export function periodsFrom(from: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, index) => addPeriods(from, index))
}

/** Meses de um intervalo de datas (o primeiro e o último inclusive). */
export function periodsOf(range: DateRange): DateKey[] {
  const out: DateKey[] = []
  for (let period = periodOf(range.start); period <= range.end; period = addPeriods(period, 1)) out.push(period)
  return out
}

export function dreMonths(index: FinanceIndex, periods: DateKey[]): DreMonth[] {
  return periods.map((period) => dreMonth(index, period))
}

/** Soma de vários meses (percentuais recalculados sobre o total). */
export function sumDre(months: DreMonth[]): Omit<DreMonth, "period" | "status"> {
  const total = (key: keyof DreMonth) => months.reduce((sum, month) => sum + (month[key] as number), 0)
  const revenue = total("revenue")
  const result = total("result")
  const contribution = total("contribution")
  return {
    revenue,
    clientRevenue: total("clientRevenue"),
    otherRevenue: total("otherRevenue"),
    tax: total("tax"),
    fees: total("fees"),
    directCosts: total("directCosts"),
    contribution,
    fixedCosts: total("fixedCosts"),
    otherExpenses: total("otherExpenses"),
    result,
    margin: revenue > 0 ? result / revenue : null,
    contributionMargin: revenue > 0 ? contribution / revenue : null,
    ownerContributions: total("ownerContributions"),
    taxPaid: total("taxPaid"),
    ownerDraws: total("ownerDraws"),
    reinvestments: total("reinvestments"),
    realizedRevenue: total("realizedRevenue"),
  }
}

/** Linhas do DRE na ordem da planilha (para telas e exportação). */
export const DRE_LINES = [
  { key: "revenue", label: "Receita bruta", sign: 1, strong: true },
  { key: "tax", label: "(−) Imposto sobre a receita", sign: -1 },
  { key: "fees", label: "(−) Taxas do gateway", sign: -1 },
  { key: "directCosts", label: "(−) Custos diretos de clientes", sign: -1 },
  { key: "contribution", label: "(=) Margem de contribuição", sign: 1, strong: true },
  { key: "fixedCosts", label: "(−) Custos fixos", sign: -1 },
  { key: "otherExpenses", label: "(−) Outras despesas (avulsas)", sign: -1 },
  { key: "result", label: "(=) Resultado do mês", sign: 1, strong: true },
] as const satisfies readonly { key: keyof DreMonth; label: string; sign: 1 | -1; strong?: boolean }[]

/** Contas por linha do DRE (para detalhar de onde vem cada número). */
export const DRE_LINE_ACCOUNTS: Record<(typeof DRE_LINES)[number]["key"], readonly FinanceAccount[]> = {
  revenue: ["client_revenue", "other_revenue"],
  tax: [],
  fees: [],
  directCosts: ["direct_cost"],
  contribution: [],
  fixedCosts: ["fixed_cost"],
  otherExpenses: ["other_expense"],
  result: [],
}

/** Itens que formam uma linha do DRE num mês (pagos e, no atual/futuro, a vencer). */
export function dreItems(
  index: FinanceIndex,
  period: DateKey,
  accounts: readonly FinanceAccount[],
  options: { realized?: boolean } = {}
): FinanceItem[] {
  const status = dreStatus(index, period)
  const realized = paidIn(index, period)
  const pending = !options.realized && (status === "current" || status === "forecast") ? pendingIn(index, period) : []
  return [...realized, ...pending].filter((item) => accounts.includes(item.account))
}

/* ------------------------------------------------------------------ */
/* Receita recorrente (MRR) e contratos                                */
/* ------------------------------------------------------------------ */

/** Mês de uma recorrência: o lançamento gravado ou a ocorrência calculada. */
export function occurrenceOf(index: FinanceIndex, recurrence: FinanceRecurrence, period: DateKey): FinanceItem {
  const saved = index.occurrences.get(occurrenceKey(recurrence.id, period))
  return saved ? fromEntry(saved, index.byRecurrence) : fromRecurrence(recurrence, period)
}

/** Ocorrências de recorrências de uma conta que valem no mês (sem os meses pulados). */
export function recurringIn(index: FinanceIndex, period: DateKey, account: FinanceAccount, clientId?: string | null): FinanceItem[] {
  const items: FinanceItem[] = []
  for (const recurrence of index.data.recurrences) {
    if (recurrence.account !== account || !recurrenceActiveIn(recurrence, period)) continue
    if (clientId !== undefined && recurrence.client_id !== clientId) continue
    const occurrence = occurrenceOf(index, recurrence, period)
    if (!occurrence.skipped) items.push(occurrence)
  }
  return items
}

const sumAmounts = (items: FinanceItem[]) => items.reduce((total, item) => total + item.amount_cents, 0)

/** MRR: soma dos contratos de clientes (receitas recorrentes) que valem no mês. */
export function mrr(index: FinanceIndex, period: DateKey, clientId?: string | null): number {
  return sumAmounts(recurringIn(index, period, "client_revenue", clientId))
}

/** Clientes com contrato recorrente no mês. */
export function activeClientIds(index: FinanceIndex, period: DateKey): Set<string> {
  return new Set(
    recurringIn(index, period, "client_revenue")
      .map((item) => item.client_id)
      .filter((id): id is string => Boolean(id))
  )
}

export interface MrrMovement {
  /** Contratos que começaram no mês. */
  added: number
  /** Contratos que terminaram no mês anterior (perdidos neste). */
  churned: number
  /** Diferença dos contratos que continuaram (reajustes). */
  changed: number
}

/** Como o MRR mudou do mês anterior para este. */
export function mrrMovement(index: FinanceIndex, period: DateKey): MrrMovement {
  const previous = addPeriods(period, -1)
  const before = new Map(recurringIn(index, previous, "client_revenue").map((item) => [item.recurrence!.id, item.amount_cents]))
  const now = new Map(recurringIn(index, period, "client_revenue").map((item) => [item.recurrence!.id, item.amount_cents]))
  let added = 0
  let churned = 0
  let changed = 0
  for (const [id, amount] of now) {
    const old = before.get(id)
    if (old === undefined) added += amount
    else changed += amount - old
  }
  for (const [id, amount] of before) if (!now.has(id)) churned += amount
  return { added, churned, changed }
}

/** Último vencimento de uma recorrência com fim; null = sem prazo. */
export function lastDueOf(recurrence: FinanceRecurrence): DateKey | null {
  return recurrence.ends_on ? occurrenceDue(recurrence, recurrence.ends_on) : null
}

/** Mês final (dia 1) para um número de parcelas a partir do mês inicial. */
export function endsOnForInstallments(startsOn: DateKey, installments: number): DateKey {
  return addPeriods(startsOn, Math.max(1, installments) - 1)
}

/** Quantas parcelas uma recorrência tem (null = sem prazo). */
export function installmentsOf(recurrence: Pick<FinanceRecurrence, "starts_on" | "ends_on">): number | null {
  if (!recurrence.ends_on) return null
  const [y1, m1] = recurrence.starts_on.split("-").map(Number)
  const [y2, m2] = recurrence.ends_on.split("-").map(Number)
  return (y2! - y1!) * 12 + (m2! - m1!) + 1
}

export type RecurrenceState = "active" | "future" | "ended"

export interface RecurrenceSummary {
  recurrence: FinanceRecurrence
  state: RecurrenceState
  firstDue: DateKey
  lastDue: DateKey | null
  /** Parcelas que ainda vencem (a partir deste mês); null = sem prazo. */
  remaining: number | null
  remainingTotal: number | null
  /** Dias até o último vencimento (negativo = já passou). */
  daysToEnd: number | null
  /** Termina dentro do prazo de alerta. */
  ending: boolean
}

export function recurrenceSummary(index: FinanceIndex, recurrence: FinanceRecurrence): RecurrenceSummary {
  const lastDue = lastDueOf(recurrence)
  const state: RecurrenceState =
    recurrence.starts_on > index.current
      ? "future"
      : recurrence.ends_on && recurrence.ends_on < index.current
        ? "ended"
        : "active"
  const from = recurrence.starts_on > index.current ? recurrence.starts_on : index.current
  const remaining =
    recurrence.ends_on === null ? null : recurrence.ends_on < from ? 0 : installmentsOf({ starts_on: from, ends_on: recurrence.ends_on })
  const daysToEnd = lastDue ? daysBetween(index.today, lastDue) : null
  return {
    recurrence,
    state,
    firstDue: occurrenceDue(recurrence, recurrence.starts_on),
    lastDue,
    remaining,
    remainingTotal: remaining === null ? null : remaining * recurrence.amount_cents,
    daysToEnd,
    ending: state !== "ended" && daysToEnd !== null && daysToEnd <= index.data.settings.contract_alert_days,
  }
}

/* ------------------------------------------------------------------ */
/* Margem por cliente                                                  */
/* ------------------------------------------------------------------ */

export interface ClientMargin {
  clientId: string
  /** Contratos do cliente que valem no mês. */
  mrr: number
  directCosts: number
  /** Imposto e taxa do gateway sobre o MRR. */
  deductions: number
  margin: number
  marginRate: number | null
  /** Frentes (categoria dos contratos). */
  services: string[]
  /** Último vencimento entre os contratos com prazo (null = algum sem prazo). */
  contractEnd: DateKey | null
  daysToEnd: number | null
  ending: boolean
}

/** Margem do cliente: MRR × (1 − imposto − taxa) − custos diretos (igual à planilha). */
export function clientMargins(index: FinanceIndex, period: DateKey = index.current): ClientMargin[] {
  const out: ClientMargin[] = []
  const ids = new Set<string>([
    ...activeClientIds(index, period),
    ...recurringIn(index, period, "direct_cost")
      .map((item) => item.client_id)
      .filter((id): id is string => Boolean(id)),
  ])
  for (const clientId of ids) {
    const contracts = recurringIn(index, period, "client_revenue", clientId)
    const revenue = sumAmounts(contracts)
    const directCosts = sumAmounts(recurringIn(index, period, "direct_cost", clientId))
    const deductions = cents(revenue * (index.taxRate + index.gatewayRate))
    const margin = revenue - deductions - directCosts
    const recurrences = contracts.map((item) => item.recurrence!).filter(Boolean)
    const open = recurrences.some((recurrence) => recurrence.ends_on === null)
    const ends = recurrences.map(lastDueOf).filter((day): day is DateKey => day !== null).sort()
    const contractEnd = open || ends.length === 0 ? null : ends[ends.length - 1]!
    const daysToEnd = contractEnd ? daysBetween(index.today, contractEnd) : null
    out.push({
      clientId,
      mrr: revenue,
      directCosts,
      deductions,
      margin,
      marginRate: revenue > 0 ? margin / revenue : null,
      services: [...new Set(recurrences.map((recurrence) => recurrence.category).filter((name): name is string => Boolean(name)))],
      contractEnd,
      daysToEnd,
      ending: daysToEnd !== null && daysToEnd <= index.data.settings.contract_alert_days,
    })
  }
  return out.sort((a, b) => b.mrr - a.mrr)
}

/* ------------------------------------------------------------------ */
/* Projeção                                                            */
/* ------------------------------------------------------------------ */

export interface ProjectionMonth {
  period: DateKey
  dre: DreMonth
  mrr: number
  /** Diferença do MRR para o mês anterior. */
  mrrChange: number
  /** Contratos de clientes que valem no mês. */
  contracts: number
  /** Contratos com o último pagamento neste mês. */
  ending: FinanceRecurrence[]
}

/** Próximos meses a partir do atual (igual à aba PROJEÇÃO 12 MESES). */
export function projection(index: FinanceIndex, months = 12, from: DateKey = index.current): ProjectionMonth[] {
  const out: ProjectionMonth[] = []
  let previous = mrr(index, addPeriods(from, -1))
  for (const period of periodsFrom(from, months)) {
    const value = mrr(index, period)
    out.push({
      period,
      dre: dreMonth(index, period),
      mrr: value,
      mrrChange: value - previous,
      contracts: recurringIn(index, period, "client_revenue").length,
      ending: index.data.recurrences.filter(
        (recurrence) => recurrence.account === "client_revenue" && recurrence.ends_on === period
      ),
    })
    previous = value
  }
  return out
}

/** Primeiro mês da projeção em que o MRR cai, e quanto. */
export function nextMrrDrop(months: ProjectionMonth[]): { period: DateKey; change: number } | null {
  const drop = months.find((month) => month.mrrChange < 0)
  return drop ? { period: drop.period, change: drop.mrrChange } : null
}

/* ------------------------------------------------------------------ */
/* Caixa, divisão do resultado e receita necessária                    */
/* ------------------------------------------------------------------ */

/** Valor líquido do lançamento no caixa: entrada − taxa; saída −(valor + taxa). */
export function netOf(entry: Pick<FinanceEntry, "kind" | "amount_cents" | "fee_cents">): number {
  return entry.kind === "income" ? entry.amount_cents - entry.fee_cents : -(entry.amount_cents + entry.fee_cents)
}

/** Saldo em conta pelos lançamentos até um dia (inclusive): saldo inicial + movimentos pagos. */
export function ledgerBalance(index: FinanceIndex, until: DateKey): number {
  const { opening_balance_cents, opening_on } = index.data.settings
  let balance = opening_balance_cents
  for (const entry of index.data.entries) {
    if (entry.skipped || !entry.paid_on || entry.paid_on < opening_on || entry.paid_on > until) continue
    balance += netOf(entry)
  }
  return balance
}

/** Custos fixos recorrentes do mês (base do caixa mínimo e da receita necessária). */
export function fixedCostsMonthly(index: FinanceIndex, period: DateKey = index.current): number {
  return sumAmounts(recurringIn(index, period, "fixed_cost"))
}

/** Caixa mínimo = meses × custos fixos mensais (do mês atual). */
export function reserveTarget(index: FinanceIndex): number {
  return index.data.settings.reserve_months * fixedCostsMonthly(index)
}

export type AllocationRule = "negative" | "building" | "split"

export interface AllocationMonth {
  period: DateKey
  status: DreStatus
  result: number
  reserveStart: number
  reserveTarget: number
  rule: AllocationRule
  /** Faltou para fechar o mês (resultado negativo, sai do caixa). */
  deficit: number
  toReserve: number
  toReinvest: number
  toOwners: number
  perPartner: number
  /** Aportes de sócios recebidos no mês. */
  contributions: number
  reserveEnd: number
  /** Falta para o caixa mínimo no fim do mês. */
  reserveGap: number
  /** Verba de reinvestimento: acumulada pela regra − já gasta. */
  reinvestAvailable: number
  /** Pró-labore pago no mês (lançamentos). */
  ownerDrawsPaid: number
  alert: "negative_reserve" | "deficit_covered" | null
}

/**
 * Divisão do resultado mês a mês, desde o primeiro mês (saldo inicial), igual
 * à aba DIVISÃO DO RESULTADO. Devolve os meses de `from` a `to`.
 */
export function allocation(index: FinanceIndex, from: DateKey, to: DateKey): AllocationMonth[] {
  const { settings } = index.data
  const target = reserveTarget(index)
  const reserveShare = fraction(settings.reserve_share_bps)
  const reinvestShare = fraction(settings.reinvest_share_bps)
  const out: AllocationMonth[] = []
  let reserve = settings.opening_balance_cents
  let reinvest = 0
  for (let period = settings.opening_on; period <= to; period = addPeriods(period, 1)) {
    const dre = dreMonth(index, period)
    const result = dre.result
    const reserveStart = reserve
    const rule: AllocationRule = result < 0 ? "negative" : reserveStart < target ? "building" : "split"
    const deficit = result < 0 ? -result : 0
    const toReserve = rule === "negative" ? 0 : rule === "building" ? result : cents(result * reserveShare)
    const toReinvest = rule === "split" ? cents(result * reinvestShare) : 0
    const toOwners = rule === "split" ? result - toReserve - toReinvest : 0
    reserve = reserveStart + toReserve - deficit + dre.ownerContributions
    reinvest += toReinvest - dre.reinvestments
    if (period >= from) {
      out.push({
        period,
        status: dre.status,
        result,
        reserveStart,
        reserveTarget: target,
        rule,
        deficit,
        toReserve,
        toReinvest,
        toOwners,
        perPartner: settings.partners > 0 ? Math.floor(toOwners / settings.partners) : 0,
        contributions: dre.ownerContributions,
        reserveEnd: reserve,
        reserveGap: Math.max(0, target - reserve),
        reinvestAvailable: reinvest,
        ownerDrawsPaid: dre.ownerDraws,
        alert: reserve < 0 ? "negative_reserve" : deficit > 0 ? "deficit_covered" : null,
      })
    }
  }
  return out
}

export interface RequiredRevenue {
  /** Sócios × alvo de pró-labore. */
  ownerTarget: number
  /** Resultado necessário = alvo ÷ % do pró-labore. */
  resultNeeded: number
  fixedMonthly: number
  /** Custo direto como fração da receita (carteira atual). */
  directRatio: number
  /** Receita mensal necessária; null quando as deduções passam de 100%. */
  required: number | null
  mrr: number
  /** Quanto falta em relação ao MRR atual. */
  gap: number | null
}

/**
 * Receita mensal necessária para o alvo de pró-labore (aba PAINEL):
 * (resultado necessário + custos fixos) ÷ (1 − imposto − taxa − custo direto %).
 */
export function requiredRevenue(index: FinanceIndex): RequiredRevenue {
  const { settings } = index.data
  const ownerShare = Math.max(0, 1 - fraction(settings.reserve_share_bps) - fraction(settings.reinvest_share_bps))
  const ownerTarget = settings.partners * settings.owner_draw_target_cents
  const resultNeeded = ownerShare > 0 ? ownerTarget / ownerShare : 0
  const fixedMonthly = fixedCostsMonthly(index)
  const current = mrr(index, index.current)
  const direct = sumAmounts(recurringIn(index, index.current, "direct_cost").filter((item) => item.client_id !== null))
  const directRatio = current > 0 ? direct / current : 0
  const divisor = 1 - index.taxRate - index.gatewayRate - directRatio
  const required = divisor > 0 ? cents((resultNeeded + fixedMonthly) / divisor) : null
  return {
    ownerTarget,
    resultNeeded: cents(resultNeeded),
    fixedMonthly,
    directRatio,
    required,
    mrr: current,
    gap: required === null ? null : Math.max(0, required - current),
  }
}

/* ------------------------------------------------------------------ */
/* Contas a receber e inadimplência                                    */
/* ------------------------------------------------------------------ */

export interface AgingBucket {
  label: string
  total: number
  count: number
}

export interface Receivables {
  overdue: FinanceItem[]
  overdueTotal: number
  /** Vencem nos próximos 30 dias (inclui hoje). */
  upcoming: FinanceItem[]
  upcomingTotal: number
  aging: AgingBucket[]
}

const isRevenue = (item: Pick<FinanceItem, "account">) => REVENUE_ACCOUNTS.includes(item.account)

export function receivables(index: FinanceIndex): Receivables {
  const { entries, recurrences } = index.data
  const overdue = overdueItems(entries, recurrences, index.today).filter(isRevenue)
  const limit = addDaysToKey(index.today, 30)
  const upcoming: FinanceItem[] = []
  for (const period of [index.current, addPeriods(index.current, 1)]) {
    for (const item of monthItems(entries, recurrences, period)) {
      if (isRevenue(item) && !item.paid_on && !item.skipped && item.due_on >= index.today && item.due_on <= limit) upcoming.push(item)
    }
  }
  const buckets = [
    { label: "1 a 30 dias", max: 30 },
    { label: "31 a 60 dias", max: 60 },
    { label: "61 a 90 dias", max: 90 },
    { label: "Mais de 90 dias", max: Infinity },
  ]
  const aging = buckets.map((bucket, position) => {
    const min = position === 0 ? 1 : buckets[position - 1]!.max + 1
    const items = overdue.filter((item) => {
      const days = daysBetween(item.due_on, index.today)
      return days >= min && days <= bucket.max
    })
    return { label: bucket.label, total: sumAmounts(items), count: items.length }
  })
  return { overdue, overdueTotal: sumAmounts(overdue), upcoming, upcomingTotal: sumAmounts(upcoming), aging }
}

export interface Delinquency {
  /** Receitas com vencimento no período. */
  billed: number
  /** Delas, vencidas e ainda não recebidas. */
  unpaid: number
  rate: number | null
  items: FinanceItem[]
}

/** Inadimplência do período: do que venceu nele, quanto segue sem pagamento. */
export function delinquency(index: FinanceIndex, range: DateRange, clientId?: string | null): Delinquency {
  const due: FinanceItem[] = []
  for (const period of periodsOf(range)) {
    for (const item of monthItems(index.data.entries, index.data.recurrences, period)) {
      if (!isRevenue(item) || item.skipped || item.due_on < range.start || item.due_on > range.end) continue
      if (clientId !== undefined && item.client_id !== clientId) continue
      due.push(item)
    }
  }
  const late = due.filter((item) => !item.paid_on && item.due_on < index.today)
  const billed = sumAmounts(due)
  const unpaid = sumAmounts(late)
  return { billed, unpaid, rate: billed > 0 ? unpaid / billed : null, items: late }
}

/* ------------------------------------------------------------------ */
/* Fechamento do mês                                                   */
/* ------------------------------------------------------------------ */

export interface EntryIssue {
  entry: FinanceEntry
  message: string
}

/** Pendências de um lançamento (a coluna Conferência da planilha). */
export function entryIssues(entry: FinanceEntry): string[] {
  const issues: string[] = []
  if (entry.account === "client_revenue" && !entry.client_id) issues.push("Receita de cliente sem cliente")
  if (entry.fee_cents > entry.amount_cents) issues.push("Taxa maior que o valor")
  if (entry.skipped && entry.paid_on) issues.push("Mês pulado com pagamento")
  return issues
}

export interface ClosingReview {
  period: DateKey
  closing: FinanceClosing | null
  /** Saldo pelos lançamentos no último dia do mês. */
  ledgerBalance: number
  /** Vencidos no mês e não pagos (precisam de decisão: pagar, pular ou mudar a data). */
  open: FinanceItem[]
  issues: EntryIssue[]
  /** O mês já acabou (só meses encerrados podem ser fechados). */
  ended: boolean
}

export function closingReview(index: FinanceIndex, period: DateKey): ClosingReview {
  const end = monthRangeOf(period).end
  const issues: EntryIssue[] = []
  for (const entry of index.data.entries) {
    if (!inMonth(entry.paid_on, period) && !inMonth(entry.due_on, period)) continue
    for (const message of entryIssues(entry)) issues.push({ entry, message })
  }
  return {
    period,
    closing: index.data.closings.find((closing) => closing.period === period) ?? null,
    ledgerBalance: ledgerBalance(index, end),
    open: monthItems(index.data.entries, index.data.recurrences, period).filter((item) => !item.paid_on && !item.skipped),
    issues,
    ended: end < index.today,
  }
}

/** O mês anterior encerrou e ainda não foi fechado? */
export function pendingClosing(index: FinanceIndex): DateKey | null {
  const previous = addPeriods(index.current, -1)
  if (previous < index.data.settings.opening_on) return null
  return index.closed.has(previous) ? null : previous
}

/* ------------------------------------------------------------------ */
/* Alertas                                                             */
/* ------------------------------------------------------------------ */

export interface FinanceAlert {
  key: string
  /** "attention" pede ação; "info" é premissa ou aviso. */
  tone: "attention" | "info"
  title: string
  detail: string
  href: string
}

const monthText = (period: DateKey) => formatMonthYear(period).toLocaleLowerCase("pt-BR")

/**
 * O que precisa de atenção no financeiro: mês a fechar, contratos acabando,
 * queda do MRR, caixa negativo na projeção, pendências de conferência e
 * premissas a confirmar.
 */
export function financeAlerts(index: FinanceIndex, clientName: (id: string) => string): FinanceAlert[] {
  const alerts: FinanceAlert[] = []
  const toClose = pendingClosing(index)
  if (toClose) {
    alerts.push({
      key: "closing",
      tone: "attention",
      title: `Fechar ${monthText(toClose)}`,
      detail: "Conferir os lançamentos com o extrato e travar o mês.",
      href: "/financeiro/fechamento",
    })
  }
  for (const summary of index.data.recurrences
    .filter((recurrence) => recurrence.account === "client_revenue")
    .map((recurrence) => recurrenceSummary(index, recurrence))
    .filter((summary) => summary.ending && summary.lastDue && summary.daysToEnd !== null && summary.daysToEnd >= 0)) {
    const client = summary.recurrence.client_id ? clientName(summary.recurrence.client_id) : summary.recurrence.description
    const days = summary.daysToEnd!
    alerts.push({
      key: `ending-${summary.recurrence.id}`,
      tone: "attention",
      title: `Contrato ${client} termina ${days === 0 ? "hoje" : `em ${days} ${days === 1 ? "dia" : "dias"}`}`,
      detail: `Último pagamento em ${summary.lastDue!.slice(8, 10)}/${summary.lastDue!.slice(5, 7)}. Renovar ou repor a receita.`,
      href: "/financeiro/contratos",
    })
  }
  const months = projection(index, 12)
  const drop = nextMrrDrop(months)
  if (drop) {
    alerts.push({
      key: "mrr-drop",
      tone: "attention",
      title: `MRR cai ${formatMoneyShort(-drop.change)} em ${monthText(drop.period)}`,
      detail: "Contratos que terminam sem renovação prevista.",
      href: "/financeiro/projecao",
    })
  }
  const negative = allocation(index, index.current, addPeriods(index.current, 11)).find((month) => month.reserveEnd < 0)
  if (negative) {
    alerts.push({
      key: "negative-reserve",
      tone: "attention",
      title: `Caixa fica negativo em ${monthText(negative.period)}`,
      detail: `Previsão de ${formatMoneyShort(negative.reserveEnd)} no fim do mês, mantidos os contratos e custos atuais.`,
      href: "/financeiro/projecao",
    })
  }
  const since = addPeriods(index.current, -11)
  const issues = index.data.entries.filter(
    (entry) => (entry.paid_on ?? entry.due_on) >= since && entryIssues(entry).length > 0
  )
  if (issues.length > 0) {
    alerts.push({
      key: "issues",
      tone: "attention",
      title: `${issues.length} ${issues.length === 1 ? "lançamento precisa" : "lançamentos precisam"} de ajuste`,
      detail: issues.slice(0, 2).map((entry) => `${entry.description}: ${entryIssues(entry)[0]}`).join(" · "),
      href: "/financeiro/lancamentos?conferencia=1",
    })
  }
  if (!index.data.settings.tax_rate_confirmed) {
    alerts.push({
      key: "tax",
      tone: "info",
      title: `Alíquota de ${(index.data.settings.tax_rate_bps / 100).toLocaleString("pt-BR")}% a confirmar`,
      detail: "É uma premissa: confirme com o contador (Simples Nacional, anexo III ou V).",
      href: "/financeiro/parametros",
    })
  }
  return alerts
}
