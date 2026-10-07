import type { Metadata } from "next"

import { getProfiles } from "@/features/metrics/profiles"
import { METRIC_AREA_LABEL, type MetricArea } from "@/features/metrics/catalog"
import { buildContext, buildDashboard } from "@/features/metrics/dashboard"
import { MetricsView, type MetricsLinks } from "@/features/metrics/metrics-view"
import { COMPARE_LABEL, parsePeriodParams, periodFor, periodSearch, PERIOD_KIND_LABEL, shiftPeriod, type PeriodKind } from "@/features/metrics/periods"
import { getMetricsSource } from "@/features/metrics/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Indicadores" }

const AREA_PARAM: Record<string, MetricArea> = { financeiro: "financial", comercial: "commercial", operacional: "operational" }
const AREA_TO_PARAM: Record<MetricArea, string> = { financial: "financeiro", commercial: "comercial", operational: "operacional" }

export default async function MetricsPage(props: PageProps<"/indicadores">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const { period, compare } = parsePeriodParams(searchParams, today)
  const areaParam = Array.isArray(searchParams.area) ? searchParams.area[0] : searchParams.area
  const area: MetricArea | "overview" = (areaParam && AREA_PARAM[areaParam]) || "overview"
  const [source, profiles] = await Promise.all([getMetricsSource(), getProfiles()])
  const ctx = buildContext(source, today)
  const dashboard = buildDashboard(ctx, period, compare, area, profiles)

  const extra = (target: MetricArea | "overview"): Record<string, string> => (target === "overview" ? {} : { area: AREA_TO_PARAM[target] })
  const href = (search: string) => `/indicadores?${search}`
  const current = periodFor(period.kind, today)
  const links: MetricsLinks = {
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
    report: `/relatorio?${periodSearch(period, compare)}`,
  }

  return <MetricsView dashboard={dashboard} area={area} links={links} />
}
