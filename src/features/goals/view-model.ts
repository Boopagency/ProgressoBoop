import { objectiveProgress, objectiveTiming, type GoalState } from "@/features/goals/logic"
import { METRICS, type MetricArea, type MetricContext } from "@/features/metrics/catalog"
import { periodFor, periodSearch } from "@/features/metrics/periods"
import type { KeyResult, MetricUnit, Objective } from "@/lib/types"

/*
 * Metas prontas para a tela (sem funções: vão do servidor para o navegador).
 */

export interface KeyResultView {
  keyResult: KeyResult
  metricLabel: string | null
  unit: MetricUnit
  current: number | null
  baseline: number
  target: number
  progress: number | null
  expected: number
  projected: number | null
  state: GoalState
  /** Detalhe do indicador (resultados automáticos). */
  href: string | null
}

export interface ObjectiveView {
  objective: Objective
  keyResults: KeyResultView[]
  progress: number | null
  expected: number
  state: GoalState
  timing: "current" | "upcoming" | "past"
}

export interface MetricOption {
  key: string
  label: string
  area: MetricArea
  unit: MetricUnit
  perClient: boolean
  formula: string
  better: "up" | "down" | null
}

export const METRIC_OPTIONS: MetricOption[] = METRICS.map((metric) => ({
  key: metric.key,
  label: metric.label,
  area: metric.area,
  unit: metric.unit,
  perClient: Boolean(metric.perClient),
  formula: metric.formula,
  better: metric.better,
}))

const AREA_PARAM: Record<MetricArea, string> = { financial: "financeiro", commercial: "comercial", operational: "operacional" }

export function goalsView(ctx: MetricContext, objectives: Objective[], keyResults: KeyResult[]): ObjectiveView[] {
  return objectives.map((objective) => {
    const progress = objectiveProgress(ctx, objective, keyResults)
    return {
      objective,
      progress: progress.progress,
      expected: progress.expected,
      state: progress.state,
      timing: objectiveTiming(objective, ctx.today),
      keyResults: progress.keyResults.map((row) => ({
        keyResult: row.keyResult,
        metricLabel: row.metric?.label ?? null,
        unit: row.unit,
        current: row.current,
        baseline: row.baseline,
        target: row.target,
        progress: row.progress,
        expected: row.expected,
        projected: row.projected,
        state: row.state,
        href: row.metric
          ? `/indicadores?${periodSearch(periodFor("month", objective.ends_on < ctx.today ? objective.ends_on : ctx.today), "previous", { area: AREA_PARAM[row.metric.area] })}`
          : null,
      })),
    }
  })
}
