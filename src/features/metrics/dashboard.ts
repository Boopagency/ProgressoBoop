import { addPeriods, monthName, periodLabel, periodOf } from "@/features/clients/logic"
import { bySource, expectedByMonth, funnel, salesByMonth } from "@/features/deals/logic"
import { clientMargins, dreMonth, financeAlerts, indexFinance, mrr, periodsFrom, receivables, type FinanceAlert } from "@/features/finance/management"
import {
  METRICS,
  type MetricArea,
  type MetricContext,
  type MetricDefinition,
  type MetricDetails,
  type MetricsSource,
} from "@/features/metrics/catalog"
import { comparisonOf, isCurrent, trendMonths, type CompareMode, type MetricPeriod } from "@/features/metrics/periods"
import { isDone } from "@/features/tasks/logic"
import { daysBetween, monthRangeOf, toDateKey } from "@/lib/dates"
import { DEAL_STAGE_LABEL, LEAD_SOURCE_LABEL } from "@/lib/labels"
import type { DateKey, MetricUnit, Profile } from "@/lib/types"

/*
 * Monta o painel de indicadores no servidor: valor no período, no período de
 * comparação, tendência de 12 meses e o detalhe de cada número, além dos
 * dados dos gráficos de cada área. O resultado é serializável (vai pronto
 * para a tela).
 */

/** Até quantas linhas de detalhe por indicador vão para a tela. */
const DETAIL_LIMIT = 80

export interface MetricSnapshot {
  key: string
  label: string
  area: MetricArea
  unit: MetricUnit
  better: "up" | "down" | null
  formula: string
  value: number | null
  previous: number | null
  /** Valor mês a mês nos últimos 12 meses (até o mês atual). */
  trend: (number | null)[]
  trendLabels: string[]
  /**
   * Quando o último mês da tendência é o atual e o valor inclui o que ainda
   * vence: o realizado até hoje (`split`, para somar com o previsto) ou só a
   * marca de previsão (proporções, em que a diferença não soma).
   */
  trendCurrent: { realized: number; split: boolean } | null
  details: MetricDetails & { total: number }
  href: string | null
}

export function buildContext(source: MetricsSource, today: DateKey, clientId?: string | null): MetricContext {
  return { ...source, index: indexFinance(source.finance, today), today, clientId }
}

export function snapshotOf(ctx: MetricContext, metric: MetricDefinition, period: MetricPeriod, compare: CompareMode): MetricSnapshot {
  const comparison = comparisonOf(period, compare)
  const lastTrend = periodOf(period.range.end) < periodOf(ctx.today) ? periodOf(period.range.end) : periodOf(ctx.today)
  const months = periodsFrom(addPeriods(lastTrend, -11), 12)
  const details = metric.details(ctx, period.range)
  const trend = months.map((month) => metric.value(ctx, monthRangeOf(month)))
  return {
    key: metric.key,
    label: metric.label,
    area: metric.area,
    unit: metric.unit,
    better: metric.better,
    formula: metric.formula,
    value: metric.value(ctx, period.range),
    previous: metric.value(ctx, comparison.range),
    trend,
    trendLabels: months.map((month) => periodLabel(month)),
    trendCurrent: currentPart(ctx, metric, lastTrend, trend[trend.length - 1] ?? null),
    details: { ...details, rows: details.rows.slice(0, DETAIL_LIMIT), total: details.rows.length },
    href: metric.href ? metric.href(period.range, ctx) : null,
  }
}

/** O realizado do mês atual, quando o valor da tendência ainda soma previsão. */
function currentPart(ctx: MetricContext, metric: MetricDefinition, month: DateKey, value: number | null): MetricSnapshot["trendCurrent"] {
  if (value === null || ctx.realizedOnly || month !== periodOf(ctx.today)) return null
  const realized = metric.value({ ...ctx, realizedOnly: true }, monthRangeOf(month))
  if (realized === null || realized === value) return null
  return { realized, split: metric.kind === "flow" && realized >= 0 && value > realized }
}

/* ------------------------------------------------------------------ */
/* Gráficos de cada área                                               */
/* ------------------------------------------------------------------ */

export interface MonthPoint {
  period: DateKey
  label: string
  title: string
  current: boolean
}

export interface FinancialCharts {
  months: MonthPoint[]
  revenue: { realized: number; forecast: number; projected: boolean }[]
  result: { value: number; projected: boolean }[]
  mrr: number[]
  clients: { clientId: string; mrr: number; share: number }[]
  aging: { label: string; total: number; count: number }[]
  overdueTotal: number
}

export interface CommercialCharts {
  funnel: { stage: string; label: string; count: number; fromStart: number | null; fromPrevious: number | null }[]
  sources: { source: string; label: string; leads: number; won: number; wonValue: number; conversion: number | null }[]
  months: MonthPoint[]
  leads: number[]
  won: number[]
  expected: { period: DateKey; title: string; weighted: number; recurring: number; count: number }[]
}

export interface OperationalCharts {
  months: MonthPoint[]
  tasksDone: number[]
  workload: { profileId: string; name: string; open: number; overdue: number }[]
  lateProjects: { id: string; name: string; dueOn: DateKey; days: number; clientId: string | null }[]
}

function monthPoints(months: DateKey[], today: DateKey): MonthPoint[] {
  const current = periodOf(today)
  return months.map((period) => ({
    period,
    label: monthName(period).slice(0, 3),
    title: periodLabel(period),
    current: period === current,
  }))
}

export function financialCharts(ctx: MetricContext, period: MetricPeriod): FinancialCharts {
  const months = trendMonths(period)
  const dre = months.map((month) => dreMonth(ctx.index, month))
  const current = periodOf(ctx.today)
  const margins = clientMargins(ctx.index, periodOf(period.range.end) > current ? current : periodOf(period.range.end))
  const total = margins.reduce((sum, margin) => sum + margin.mrr, 0)
  const open = receivables(ctx.index)
  return {
    months: monthPoints(months, ctx.today),
    revenue: dre.map((month) => ({
      realized: month.status === "forecast" ? 0 : month.realizedRevenue,
      forecast: month.revenue - (month.status === "forecast" ? 0 : month.realizedRevenue),
      projected: month.status === "forecast",
    })),
    result: dre.map((month) => ({ value: month.result, projected: month.status === "current" || month.status === "forecast" })),
    mrr: months.map((month) => mrr(ctx.index, month)),
    clients: margins.filter((margin) => margin.mrr > 0).map((margin) => ({ clientId: margin.clientId, mrr: margin.mrr, share: total > 0 ? margin.mrr / total : 0 })),
    aging: open.aging,
    overdueTotal: open.overdueTotal,
  }
}

export function commercialCharts(ctx: MetricContext, period: MetricPeriod): CommercialCharts {
  const months = trendMonths(period)
  const series = salesByMonth(ctx.deals, months)
  const ahead = periodsFrom(periodOf(ctx.today), 3)
  return {
    funnel: funnel(ctx.deals, period.range).map((step) => ({
      stage: step.stage,
      label: DEAL_STAGE_LABEL[step.stage],
      count: step.count,
      fromStart: step.fromStart,
      fromPrevious: step.fromPrevious,
    })),
    sources: bySource(ctx.deals, period.range).map((row) => ({ ...row, label: LEAD_SOURCE_LABEL[row.source] })),
    months: monthPoints(months, ctx.today),
    leads: series.map((month) => month.leads),
    won: series.map((month) => month.won),
    expected: expectedByMonth(ctx.deals, ahead).map((row) => ({ ...row, title: periodLabel(row.period) })),
  }
}

export function operationalCharts(ctx: MetricContext, period: MetricPeriod, profiles: Profile[]): OperationalCharts {
  const months = trendMonths(period)
  const done = ctx.tasks.filter((task) => task.status === "done" && task.completed_at)
  const open = ctx.tasks.filter((task) => !isDone(task))
  return {
    months: monthPoints(months, ctx.today),
    tasksDone: months.map((month) => {
      const range = monthRangeOf(month)
      return done.filter((task) => {
        const day = toDateKey(task.completed_at!)
        return day >= range.start && day <= range.end
      }).length
    }),
    workload: profiles.map((profile) => {
      const mine = open.filter((task) => task.assignee_ids.includes(profile.id))
      return {
        profileId: profile.id,
        name: profile.full_name,
        open: mine.length,
        overdue: mine.filter((task) => task.due_date !== null && task.due_date < ctx.today).length,
      }
    }),
    lateProjects: ctx.projects
      .filter((project) => project.status === "active" && project.due_on !== null && project.due_on < ctx.today)
      .map((project) => ({ id: project.id, name: project.name, dueOn: project.due_on!, days: daysBetween(project.due_on!, ctx.today), clientId: project.client_id }))
      .sort((a, b) => b.days - a.days),
  }
}

export interface Dashboard {
  period: { label: string; short: string; current: boolean; future: boolean }
  comparison: { label: string; short: string }
  snapshots: MetricSnapshot[]
  financial: FinancialCharts | null
  commercial: CommercialCharts | null
  operational: OperationalCharts | null
  alerts: FinanceAlert[]
}

/** Indicadores da visão geral (os que a sócia e os sócios olham primeiro). */
export const OVERVIEW_KEYS = [
  "revenue",
  "result",
  "mrr",
  "cash_balance",
  "receivables_overdue",
  "leads",
  "won_mrr",
  "win_rate",
  "on_time_rate",
  "tasks_overdue",
  "projects_late",
  "reviews_on_time",
] as const

export function buildDashboard(
  ctx: MetricContext,
  period: MetricPeriod,
  compare: CompareMode,
  area: MetricArea | "overview",
  profiles: Profile[]
): Dashboard {
  const comparison = comparisonOf(period, compare)
  const metrics =
    area === "overview"
      ? OVERVIEW_KEYS.map((key) => METRICS.find((metric) => metric.key === key)!)
      : METRICS.filter((metric) => metric.area === area)
  const clientName = (id: string) => ctx.clients.find((client) => client.id === id)?.name ?? "cliente"
  return {
    period: { label: period.label, short: period.short, current: isCurrent(period, ctx.today), future: period.range.start > ctx.today },
    comparison: { label: comparison.label, short: comparison.short },
    snapshots: metrics.map((metric) => snapshotOf(ctx, metric, period, compare)),
    financial: area === "financial" || area === "overview" ? financialCharts(ctx, period) : null,
    commercial: area === "commercial" ? commercialCharts(ctx, period) : null,
    operational: area === "operational" ? operationalCharts(ctx, period, profiles) : null,
    alerts: area === "overview" || area === "financial" ? financeAlerts(ctx.index, clientName) : [],
  }
}
