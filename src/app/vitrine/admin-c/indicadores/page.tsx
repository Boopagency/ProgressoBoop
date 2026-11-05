"use client"

import { useSearchParams } from "next/navigation"

import type { MetricArea } from "@/features/metrics/catalog"
import { buildContext, buildDashboard } from "@/features/metrics/dashboard"
import { AREA_PARAM, metricsLinks } from "@/features/metrics/links"
import { MetricsView } from "@/features/metrics/metrics-view"
import { parsePeriodParams } from "@/features/metrics/periods"
import { todayKey } from "@/lib/dates"

import { vitrineWorkspace } from "../../fixtures"
import { gestaoMetricsSource } from "../fixtures"
import { GestaoFrame } from "../gestao-frame"

/** Indicadores de verdade, com dados de exemplo (a área e o período vêm da URL). */
export default function VitrineMetricsPage() {
  const params = Object.fromEntries(useSearchParams().entries())
  const today = todayKey()
  const { period, compare } = parsePeriodParams(params, today)
  const area: MetricArea | "overview" = (params.area && AREA_PARAM[params.area]) || "overview"
  const dashboard = buildDashboard(buildContext(gestaoMetricsSource(today), today), period, compare, area, vitrineWorkspace(today).profiles)
  return (
    <GestaoFrame active="/indicadores">
      <MetricsView dashboard={dashboard} area={area} links={metricsLinks(period, compare, area, today, "/vitrine/admin-c/indicadores", "/vitrine/admin-c/relatorio")} />
    </GestaoFrame>
  )
}
