import { METRIC_AREA_LABEL, type MetricArea } from "@/features/metrics/catalog"
import { COMPARE_LABEL, periodFor, periodSearch, PERIOD_KIND_LABEL, shiftPeriod, type CompareMode, type MetricPeriod, type PeriodKind } from "@/features/metrics/periods"
import type { MetricsLinks } from "@/features/metrics/metrics-view"
import type { DateKey } from "@/lib/types"

export const AREA_PARAM: Record<string, MetricArea> = { financeiro: "financial", comercial: "commercial", operacional: "operational" }
const AREA_TO_PARAM: Record<MetricArea, string> = { financial: "financeiro", commercial: "comercial", operational: "operacional" }

/** Os links da tela Indicadores (áreas, tipo de período, setas, comparação, Excel e relatório). */
export function metricsLinks(
  period: MetricPeriod,
  compare: CompareMode,
  area: MetricArea | "overview",
  today: DateKey,
  base = "/indicadores",
  reportBase = "/relatorio"
): MetricsLinks {
  const extra = (target: MetricArea | "overview"): Record<string, string> => (target === "overview" ? {} : { area: AREA_TO_PARAM[target] })
  const href = (search: string) => `${base}?${search}`
  const current = periodFor(period.kind, today)
  return {
    areas: (["overview", "financial", "commercial", "operational"] as const).map((key) => ({
      key,
      label: key === "overview" ? "Visão geral" : METRIC_AREA_LABEL[key],
      href: href(periodSearch(period, compare, extra(key))),
    })),
    kinds: (["month", "quarter", "year"] as PeriodKind[]).map((kind) => ({
      key: kind,
      label: PERIOD_KIND_LABEL[kind],
      href: href(periodSearch(periodFor(kind, period.range.start > today || period.range.end < today ? period.range.start : today), compare, extra(area))),
      active: kind === period.kind,
    })),
    previous: href(periodSearch(shiftPeriod(period, -1), compare, extra(area))),
    next: href(periodSearch(shiftPeriod(period, 1), compare, extra(area))),
    today: current.range.start === period.range.start ? null : href(periodSearch(current, compare, extra(area))),
    compare: (["previous", "year"] as const).map((mode) => ({
      key: mode,
      label: COMPARE_LABEL[mode].charAt(0).toUpperCase() + COMPARE_LABEL[mode].slice(1),
      href: href(periodSearch(period, mode, extra(area))),
      active: mode === compare,
    })),
    excel: `/api/relatorios/excel?${periodSearch(period, compare, { secoes: "indicadores,dre,contratos,comercial" })}`,
    report: `${reportBase}?${periodSearch(period, compare)}`,
  }
}
