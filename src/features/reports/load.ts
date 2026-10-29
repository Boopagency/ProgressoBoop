import "server-only"

import { periodOf } from "@/features/clients/logic"
import { parseLedgerFilters } from "@/features/finance/ledger-filters"
import { periodsFrom, periodsOf } from "@/features/finance/management"
import { defaultDreStart } from "@/features/finance/ranges"
import { getGoals } from "@/features/goals/queries"
import { goalsView } from "@/features/goals/view-model"
import { fetchMetricsSummaries } from "@/features/instagram/metrics-queries"
import type { MetricsSource } from "@/features/metrics/catalog"
import { buildContext } from "@/features/metrics/dashboard"
import { parsePeriodParams } from "@/features/metrics/periods"
import { getProfiles } from "@/features/metrics/profiles"
import { getMetricsSource } from "@/features/metrics/queries"
import { parseSections } from "@/features/reports/sections"
import type { ReportInput } from "@/features/reports/workbook"
import { firstName } from "@/features/tasks/logic"
import { addDaysToKey, formatShortDate, monthRangeOf, todayKey, toTimeLabel, zonedTimeToInstant } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import type { SessionUser } from "@/lib/types"
import { isUuid } from "@/lib/utils"

type Params = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Recorte de um cliente: os dados dele (o resultado vira a margem do cliente). */
function scopeToClient(source: MetricsSource, clientId: string): MetricsSource {
  return {
    finance: {
      ...source.finance,
      entries: source.finance.entries.filter((entry) => entry.client_id === clientId),
      recurrences: source.finance.recurrences.filter((recurrence) => recurrence.client_id === clientId),
    },
    deals: source.deals.filter((deal) => deal.client_id === clientId),
    tasks: source.tasks.filter((task) => task.client_id === clientId),
    projects: source.projects.filter((project) => project.client_id === clientId),
    clients: source.clients.filter((client) => client.id === clientId),
    reviews: source.reviews.filter((review) => review.client_id === clientId),
  }
}

/**
 * Tudo de um relatório a partir dos parâmetros da URL (período, comparação,
 * seções, meses do DRE, filtros do extrato e cliente).
 */
export async function loadReport(params: Params, user: SessionUser): Promise<{ input: ReportInput; clientName: string | null }> {
  const today = todayKey()
  const { period, compare } = parsePeriodParams(params, today)
  const [fullSource, profiles, goals] = await Promise.all([getMetricsSource(), getProfiles(), getGoals()])
  const clientParam = single(params.cliente)
  const client = clientParam && isUuid(clientParam) ? fullSource.clients.find((candidate) => candidate.id === clientParam) : undefined
  const source = client ? scopeToClient(fullSource, client.id) : fullSource
  const ctx = buildContext(source, today)
  const sections = parseSections(params.secoes)
  // Instagram: os posts publicados no período (dias de São Paulo), pela última leitura de cada um.
  const instagram = sections.includes("instagram")
    ? await fetchMetricsSummaries(
        await createClient(),
        {
          from: zonedTimeToInstant(period.range.start, "00:00"),
          to: zonedTimeToInstant(addDaysToKey(period.range.end, 1), "00:00"),
        },
        client?.id
      )
    : []

  const de = single(params.de)
  const ate = single(params.ate)
  // DRE: o intervalo pedido; num mês, a mesma janela da aba DRE (o mês no meio); senão, os meses do período.
  const dreMonths =
    de && ate && /^\d{4}-\d{2}$/.test(de) && /^\d{4}-\d{2}$/.test(ate)
      ? periodsOf({ start: `${de}-01`, end: monthRangeOf(`${ate}-01`).end }).slice(0, 36)
      : period.kind === "month"
        ? periodsFrom(defaultDreStart(source.finance.settings.opening_on, period.months[0]!), 12)
        : period.months
  const hasLedgerPeriod = Boolean(single(params.mes) || de || ate)
  const ledgerBase = parseLedgerFilters(params, periodOf(today))
  const ledger = hasLedgerPeriod
    ? ledgerBase
    : { ...ledgerBase, from: period.months[0]!, to: period.months[period.months.length - 1]! }

  const now = new Date()
  return {
    clientName: client?.name ?? null,
    input: {
      ctx,
      period,
      compare,
      sections,
      dreMonths: dreMonths.length > 0 ? dreMonths : period.months,
      ledger: client ? { ...ledger, clientId: client.id } : ledger,
      profiles,
      goals: client ? [] : goalsView(ctx, goals.objectives, goals.keyResults),
      instagram,
      generatedBy: firstName(user.full_name),
      generatedAt: `${formatShortDate(today)}/${today.slice(0, 4)} às ${toTimeLabel(now)}`,
    },
  }
}
