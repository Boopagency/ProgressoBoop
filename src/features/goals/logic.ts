import { addPeriods, periodOf } from "@/features/clients/logic"
import { periodsFrom, requiredRevenue } from "@/features/finance/management"
import { METRIC_BY_KEY, type MetricContext, type MetricDefinition } from "@/features/metrics/catalog"
import { addDaysToKey, daysBetween, monthRangeOf, type DateRange } from "@/lib/dates"
import type { DateKey, KeyResult, MetricUnit, Objective } from "@/lib/types"

/*
 * Metas (OKRs): progresso dos resultados-chave a partir dos indicadores.
 *
 * - Automático: o valor sai do indicador no período do objetivo (do começo até
 *   hoje, só o realizado). Indicadores de estoque (MRR, saldo) valem hoje.
 * - Progresso = (atual − base) ÷ (meta − base). A base padrão é zero para
 *   indicadores de fluxo e o valor no início do período para os de estoque.
 * - Ritmo: compara o progresso com a fração do período que já passou.
 * - Previsão no fim: financeiro pelo DRE previsto; o resto, pelo ritmo atual
 *   (a partir de um quarto do período).
 */

export type GoalState = "upcoming" | "on_track" | "at_risk" | "behind" | "achieved" | "ended" | "missed"

export const GOAL_STATE_LABEL: Record<GoalState, string> = {
  upcoming: "Não começou",
  on_track: "No ritmo",
  at_risk: "Atenção",
  behind: "Atrasada",
  achieved: "Atingida",
  ended: "Encerrada",
  missed: "Não atingida",
}

export interface KeyResultProgress {
  keyResult: KeyResult
  metric: MetricDefinition | null
  unit: MetricUnit
  current: number | null
  baseline: number
  target: number
  /** 0–1+ (pode passar de 1). */
  progress: number | null
  /** Fração do período que já passou (0–1). */
  expected: number
  /** Valor previsto no fim do período (null quando não dá para prever). */
  projected: number | null
  state: GoalState
}

export interface ObjectiveProgress {
  objective: Objective
  keyResults: KeyResultProgress[]
  progress: number | null
  expected: number
  state: GoalState
}

/** Fração do período decorrida até hoje (0 antes de começar, 1 depois de acabar). */
export function elapsedFraction(objective: Pick<Objective, "starts_on" | "ends_on">, today: DateKey): number {
  if (today < objective.starts_on) return 0
  if (today >= objective.ends_on) return 1
  const total = daysBetween(objective.starts_on, objective.ends_on) + 1
  return (daysBetween(objective.starts_on, today) + 1) / total
}

/** Intervalo do objetivo até hoje (para o realizado). */
function soFar(objective: Pick<Objective, "starts_on" | "ends_on">, today: DateKey): DateRange {
  return { start: objective.starts_on, end: objective.ends_on < today ? objective.ends_on : today }
}

/** Valor do indicador no período do objetivo (realizado até hoje). */
export function metricValue(ctx: MetricContext, metric: MetricDefinition, objective: Pick<Objective, "starts_on" | "ends_on">, clientId: string | null): number | null {
  if (ctx.today < objective.starts_on) return null
  return metric.value({ ...ctx, clientId, realizedOnly: true }, soFar(objective, ctx.today))
}

/** Base padrão: zero para fluxo; o valor no começo do período para estoque e proporção. */
export function defaultBaseline(ctx: MetricContext, metric: MetricDefinition, objective: Pick<Objective, "starts_on">, clientId: string | null): number {
  if (metric.kind === "flow") return 0
  const day = addDaysToKey(objective.starts_on, -1)
  const before = metric.kind === "stock" ? { start: day, end: day } : monthRangeOf(periodOf(day))
  return metric.value({ ...ctx, clientId, realizedOnly: true }, before) ?? 0
}

function stateOf(progress: number | null, expected: number, today: DateKey, objective: Pick<Objective, "starts_on" | "ends_on">): GoalState {
  if (today < objective.starts_on) return "upcoming"
  if (progress !== null && progress >= 1) return "achieved"
  if (today > objective.ends_on) return progress === null ? "ended" : "missed"
  if (progress === null) return "on_track"
  if (progress >= expected - 0.1) return "on_track"
  return progress >= expected - 0.3 ? "at_risk" : "behind"
}

export function keyResultProgress(ctx: MetricContext, objective: Objective, keyResult: KeyResult): KeyResultProgress {
  const metric = keyResult.metric ? (METRIC_BY_KEY.get(keyResult.metric) ?? null) : null
  const clientId = metric?.perClient ? keyResult.client_id : null
  const current = metric ? metricValue(ctx, metric, objective, clientId) : keyResult.manual_value
  const baseline = keyResult.baseline_value ?? (metric ? defaultBaseline(ctx, metric, objective, clientId) : 0)
  const target = keyResult.target_value
  const span = target - baseline
  const progress = current === null || span === 0 ? (current !== null && current === target ? 1 : null) : (current - baseline) / span
  const expected = elapsedFraction(objective, ctx.today)
  return {
    keyResult,
    metric,
    unit: metric?.unit ?? (keyResult.unit as MetricUnit),
    current,
    baseline,
    target,
    progress,
    expected,
    projected: projectedValue(ctx, metric, objective, clientId, current, expected),
    state: stateOf(progress, expected, ctx.today, objective),
  }
}

/** Previsão para o fim do período. */
function projectedValue(
  ctx: MetricContext,
  metric: MetricDefinition | null,
  objective: Objective,
  clientId: string | null,
  current: number | null,
  expected: number
): number | null {
  if (!metric || current === null || ctx.today > objective.ends_on || metric.kind !== "flow") return null
  if (metric.area === "financial") {
    // Financeiro: o DRE previsto (contratos, custos fixos e o que já está agendado).
    return metric.value({ ...ctx, clientId, realizedOnly: false }, { start: objective.starts_on, end: objective.ends_on })
  }
  // Pelo ritmo, só depois de um quarto do período (antes disso a conta exagera).
  return expected >= 0.25 ? Math.round((current / expected) * 10) / 10 : null
}

export function objectiveProgress(ctx: MetricContext, objective: Objective, keyResults: KeyResult[]): ObjectiveProgress {
  const rows = keyResults
    .filter((keyResult) => keyResult.objective_id === objective.id)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((keyResult) => keyResultProgress(ctx, objective, keyResult))
  const measured = rows.filter((row) => row.progress !== null)
  const progress = measured.length > 0 ? measured.reduce((sum, row) => sum + Math.min(1, Math.max(0, row.progress!)), 0) / measured.length : null
  const expected = elapsedFraction(objective, ctx.today)
  return { objective, keyResults: rows, progress, expected, state: stateOf(progress, expected, ctx.today, objective) }
}

/* ------------------------------------------------------------------ */
/* Sugestões de meta                                                   */
/* ------------------------------------------------------------------ */

export interface TargetSuggestion {
  label: string
  value: number
  hint: string
}

/**
 * Metas coerentes com os dados: o ritmo dos últimos 3 meses projetado no
 * período, crescimentos sobre o valor de hoje e, para o MRR, a receita
 * necessária para o alvo de pró-labore.
 */
export function suggestTargets(
  ctx: MetricContext,
  metric: MetricDefinition,
  objective: Pick<Objective, "starts_on" | "ends_on">,
  clientId: string | null
): TargetSuggestion[] {
  const scoped = { ...ctx, clientId: metric.perClient ? clientId : null, realizedOnly: true }
  const current = periodOf(ctx.today)
  const recent = periodsFrom(addPeriods(current, -3), 3)
  const suggestions: TargetSuggestion[] = []
  const round = (value: number) => (metric.unit === "money" ? Math.round(value / 10000) * 10000 : Math.round(value * 10) / 10)
  if (metric.kind === "flow") {
    const values = recent.map((period) => metric.value(scoped, monthRangeOf(period)) ?? 0)
    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    const months = Math.max(1, Math.round((daysBetween(objective.starts_on, objective.ends_on) + 1) / 30.4))
    if (average > 0) {
      suggestions.push({ label: "Manter o ritmo", value: round(average * months), hint: `média dos últimos 3 meses × ${months} ${months === 1 ? "mês" : "meses"}` })
      suggestions.push({ label: "+20%", value: round(average * months * 1.2), hint: "20% acima do ritmo atual" })
    }
  } else {
    const now = metric.value(scoped, monthRangeOf(current))
    if (now !== null && now !== 0) {
      const factor = metric.better === "down" ? 0.8 : 1.2
      suggestions.push({ label: metric.better === "down" ? "−20%" : "+20%", value: round(now * factor), hint: `sobre o valor de hoje` })
      if (metric.unit !== "percent") {
        suggestions.push({ label: metric.better === "down" ? "−50%" : "+50%", value: round(now * (metric.better === "down" ? 0.5 : 1.5)), hint: "meta ambiciosa" })
      }
    }
  }
  if (metric.key === "mrr") {
    const needed = requiredRevenue(ctx.index)
    if (needed.required !== null && needed.required > 0) {
      suggestions.push({ label: "Receita necessária", value: Math.round(needed.required / 100) * 100, hint: "para o alvo de pró-labore dos sócios (Projeção)" })
    }
  }
  if (metric.key === "cash_months") suggestions.push({ label: "Caixa mínimo", value: ctx.finance.settings.reserve_months, hint: "meses de custo fixo dos parâmetros" })
  return suggestions
}

/* ------------------------------------------------------------------ */
/* Períodos                                                            */
/* ------------------------------------------------------------------ */

export type ObjectiveFilter = "current" | "upcoming" | "past" | "all"

export function objectiveTiming(objective: Pick<Objective, "starts_on" | "ends_on">, today: DateKey): "current" | "upcoming" | "past" {
  if (today < objective.starts_on) return "upcoming"
  return today > objective.ends_on ? "past" : "current"
}

/** Atalhos de período para um objetivo novo. */
export function periodShortcuts(today: DateKey): { label: string; starts_on: DateKey; ends_on: DateKey }[] {
  const month = periodOf(today)
  const quarterStart = `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
  const nextQuarter = addPeriods(quarterStart, 3)
  const year = `${today.slice(0, 4)}-01-01`
  return [
    { label: "Este mês", starts_on: month, ends_on: monthRangeOf(month).end },
    { label: "Este trimestre", starts_on: quarterStart, ends_on: monthRangeOf(addPeriods(quarterStart, 2)).end },
    { label: "Próximo trimestre", starts_on: nextQuarter, ends_on: monthRangeOf(addPeriods(nextQuarter, 2)).end },
    { label: "Este ano", starts_on: year, ends_on: `${today.slice(0, 4)}-12-31` },
  ]
}
