import type { Metadata } from "next"

import { getProfiles } from "@/features/metrics/profiles"
import type { MetricArea } from "@/features/metrics/catalog"
import { buildContext, buildDashboard } from "@/features/metrics/dashboard"
import { AREA_PARAM, metricsLinks } from "@/features/metrics/links"
import { MetricsView } from "@/features/metrics/metrics-view"
import { parsePeriodParams } from "@/features/metrics/periods"
import { getMetricsSource } from "@/features/metrics/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Indicadores" }

export default async function MetricsPage(props: PageProps<"/indicadores">) {
  const searchParams = await props.searchParams
  const today = todayKey()
  const { period, compare } = parsePeriodParams(searchParams, today)
  const areaParam = Array.isArray(searchParams.area) ? searchParams.area[0] : searchParams.area
  const area: MetricArea | "overview" = (areaParam && AREA_PARAM[areaParam]) || "overview"
  const [source, profiles] = await Promise.all([getMetricsSource(), getProfiles()])
  const ctx = buildContext(source, today)
  const dashboard = buildDashboard(ctx, period, compare, area, profiles)

  return <MetricsView dashboard={dashboard} area={area} links={metricsLinks(period, compare, area, today)} />
}
