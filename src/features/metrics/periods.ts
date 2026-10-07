import { addPeriods, periodOf } from "@/features/clients/logic"
import { periodsFrom } from "@/features/finance/management"
import { monthRangeOf, type DateRange } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

/*
 * Períodos dos indicadores: mês, trimestre ou ano, sempre meses inteiros, e o
 * período de comparação (o anterior ou o mesmo do ano passado).
 */

export type PeriodKind = "month" | "quarter" | "year"
export type CompareMode = "previous" | "year"

export interface MetricPeriod {
  kind: PeriodKind
  /** Primeiro dia ao último dia do período. */
  range: DateRange
  /** Meses do período (dia 1). */
  months: DateKey[]
  label: string
  short: string
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MONTH_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = { month: "Mês", quarter: "Trimestre", year: "Ano" }
export const COMPARE_LABEL: Record<CompareMode, string> = { previous: "período anterior", year: "mesmo período do ano passado" }

/** O período (do tipo pedido) que contém o dia. */
export function periodFor(kind: PeriodKind, day: DateKey): MetricPeriod {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  let first: DateKey
  let count: number
  if (kind === "month") {
    first = periodOf(day)
    count = 1
  } else if (kind === "quarter") {
    first = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
    count = 3
  } else {
    first = `${year}-01-01`
    count = 12
  }
  const months = periodsFrom(first, count)
  const last = months[months.length - 1]!
  const yy = String(year).slice(2)
  const quarter = Math.floor((Number(first.slice(5, 7)) - 1) / 3) + 1
  return {
    kind,
    range: { start: first, end: monthRangeOf(last).end },
    months,
    label:
      kind === "month" ? `${MONTH_LONG[month - 1]} de ${year}` : kind === "quarter" ? `${quarter}º trimestre de ${year}` : String(year),
    short: kind === "month" ? `${MONTH_SHORT[month - 1]}/${yy}` : kind === "quarter" ? `${quarter}º tri/${yy}` : String(year),
  }
}

/** Período deslocado (−1 = o anterior). */
export function shiftPeriod(period: MetricPeriod, steps: number): MetricPeriod {
  const size = period.kind === "month" ? 1 : period.kind === "quarter" ? 3 : 12
  return periodFor(period.kind, addPeriods(period.months[0]!, steps * size))
}

export function comparisonOf(period: MetricPeriod, mode: CompareMode): MetricPeriod {
  return mode === "year" ? periodFor(period.kind, addPeriods(period.months[0]!, -12)) : shiftPeriod(period, -1)
}

/** O período inclui hoje (números do mês corrente: realizado + o que ainda vence)? */
export function isCurrent(period: MetricPeriod, today: DateKey): boolean {
  return today >= period.range.start && today <= period.range.end
}

export function isFuture(period: MetricPeriod, today: DateKey): boolean {
  return period.range.start > today
}

/** Últimos 12 meses terminando no último mês do período (tendência dos indicadores). */
export function trendMonths(period: MetricPeriod, count = 12): DateKey[] {
  return periodsFrom(addPeriods(period.months[period.months.length - 1]!, -(count - 1)), count)
}

const KIND_PARAM: Record<string, PeriodKind> = { mes: "month", trimestre: "quarter", ano: "year" }
const KIND_TO_PARAM: Record<PeriodKind, string> = { month: "mes", quarter: "trimestre", year: "ano" }

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

/** `?periodo=trimestre&ref=2026-10&comparar=ano` → período e comparação. */
export function parsePeriodParams(params: Record<string, unknown>, today: DateKey): { period: MetricPeriod; compare: CompareMode } {
  const kindParam = first(params.periodo)
  const kind = typeof kindParam === "string" ? (KIND_PARAM[kindParam] ?? "month") : "month"
  const ref = first(params.ref)
  let anchor = today
  if (typeof ref === "string") {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ref)) anchor = `${ref}-01`
    else if (/^\d{4}$/.test(ref)) anchor = `${ref}-01-01`
  }
  const year = Number(anchor.slice(0, 4))
  if (year < 2000 || year > 2100) anchor = today
  return { period: periodFor(kind, anchor), compare: first(params.comparar) === "ano" ? "year" : "previous" }
}

/** Parâmetros da URL de um período (o inverso de parsePeriodParams). */
export function periodSearch(period: MetricPeriod, compare: CompareMode, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams(extra)
  search.set("periodo", KIND_TO_PARAM[period.kind])
  search.set("ref", period.kind === "year" ? period.months[0]!.slice(0, 4) : period.months[0]!.slice(0, 7))
  if (compare === "year") search.set("comparar", "ano")
  return search.toString()
}
