import type { ReactNode } from "react"

import { BarList } from "@/components/charts/bar-list"
import { CountColumnChart, MoneyColumnChart, MoneyLineChart } from "@/components/charts/presets"
import { KpiTile } from "@/components/kpi-tile"
import { BoopMark } from "@/components/layout/boop-mark"
import { monthName, periodLabel } from "@/features/clients/logic"
import { contractValue, isOpenDeal, probabilityOf } from "@/features/deals/logic"
import { allocation, clientMargins, DRE_LINES, dreMonth, projection } from "@/features/finance/management"
import { formatMoney, formatMoneyShort } from "@/features/finance/money"
import { GOAL_STATE_LABEL } from "@/features/goals/logic"
import { METRIC_AREA_LABEL, METRICS, type MetricArea } from "@/features/metrics/catalog"
import { commercialCharts, operationalCharts, snapshotOf } from "@/features/metrics/dashboard"
import { formatMetric, metricDelta } from "@/features/metrics/format"
import { comparisonOf } from "@/features/metrics/periods"
import { REPORT_SECTION_LABEL, type ReportSection } from "@/features/reports/sections"
import type { ReportInput } from "@/features/reports/workbook"
import { formatShortDate } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import { DEAL_STAGE_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

/*
 * Relatório para apresentar ou salvar em PDF: os mesmos números das telas,
 * organizados por seção, com gráficos e tabelas que cabem na página.
 */

function Section({ id, title, children, className }: { id: ReportSection; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`secao-${id}`} className={cn("report-section mt-10 first:mt-0", className)}>
      <h2 id={`secao-${id}`} className="border-b pb-2 font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const AREAS: MetricArea[] = ["financial", "commercial", "operational"]

export function ReportView({ input, clientName, actions }: { input: ReportInput; clientName: string | null; actions: ReactNode }) {
  const { ctx, period } = input
  const comparison = comparisonOf(period, input.compare)
  const has = (section: ReportSection) => input.sections.includes(section)
  const clientOf = (id: string | null) => (id ? (ctx.clients.find((client) => client.id === id)?.name ?? "") : "")

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <BoopMark className="w-10" />
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Relatório de gestão{clientName ? ` · ${clientName}` : ""}</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{period.label}</h1>
            <p className="text-xs text-muted-foreground">
              Comparado com {comparison.label.toLocaleLowerCase("pt-BR")} · gerado em {input.generatedAt} por {input.generatedBy}
            </p>
          </div>
        </div>
        <div className="print:hidden">{actions}</div>
      </header>

      <main className="mt-8">
        {has("indicadores") ? (
          <Section id="indicadores" title={REPORT_SECTION_LABEL.indicadores}>
            {AREAS.map((area) => {
              const metrics = METRICS.filter((metric) => metric.area === area && (!clientName || metric.perClient))
              if (metrics.length === 0) return null
              return (
                <div key={area} className="report-block mt-5 first:mt-0">
                  <h3 className="text-sm font-semibold text-foreground">{METRIC_AREA_LABEL[area]}</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
                    {metrics.map((metric) => {
                      const snapshot = snapshotOf(ctx, metric, period, input.compare)
                      return (
                        <KpiTile
                          key={metric.key}
                          label={metric.label}
                          value={formatMetric(snapshot.value, metric.unit)}
                          delta={metricDelta(snapshot.value, snapshot.previous, metric.unit, metric.better, `vs ${comparison.short}`)}
                          trend={snapshot.trend}
                          className="px-3 py-2.5"
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </Section>
        ) : null}

        {has("dre") ? <DreSection input={input} /> : null}

        {has("projecao") && !clientName ? <ProjectionSection input={input} /> : null}

        {has("contratos") ? (
          <Section id="contratos" title={REPORT_SECTION_LABEL.contratos}>
            <ReportTable
              head={["Cliente", "Frentes", "MRR", "Imposto e taxa", "Custos diretos", "Margem", "Fim do contrato"]}
              align={["left", "left", "right", "right", "right", "right", "right"]}
              rows={clientMargins(ctx.index).map((margin) => [
                clientOf(margin.clientId),
                margin.services.join(", "),
                formatMoney(margin.mrr),
                margin.deductions > 0 ? formatMoney(-margin.deductions) : "—",
                margin.directCosts > 0 ? formatMoney(-margin.directCosts) : "—",
                `${formatMoney(margin.margin)} (${formatPercent(margin.marginRate, true)})`,
                margin.contractEnd ? formatShortDate(margin.contractEnd) + `/${margin.contractEnd.slice(0, 4)}` : "sem prazo",
              ])}
              empty="Nenhum contrato ativo."
            />
          </Section>
        ) : null}

        {has("comercial") ? <CommercialSection input={input} /> : null}

        {has("operacional") ? <OperationalSection input={input} /> : null}

        {has("metas") && input.goals.length > 0 ? (
          <Section id="metas" title={REPORT_SECTION_LABEL.metas}>
            <div className="space-y-4">
              {input.goals
                .filter((goal) => goal.timing !== "upcoming")
                .map((goal) => (
                  <div key={goal.objective.id} className="report-block rounded-lg border p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">{goal.objective.title}</h3>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatShortDate(goal.objective.starts_on)} a {formatShortDate(goal.objective.ends_on)} · {GOAL_STATE_LABEL[goal.state]} ·{" "}
                        {goal.progress === null ? "—" : formatPercent(goal.progress, true)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {goal.keyResults.map((row) => (
                        <li key={row.keyResult.id} className="text-[13px]">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-foreground">{row.keyResult.title}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatMetric(row.current, row.unit)} de {formatMetric(row.target, row.unit)} · {GOAL_STATE_LABEL[row.state]}
                            </span>
                          </div>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted print:border">
                            <span className="block h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, (row.progress ?? 0) * 100))}%` }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </Section>
        ) : null}
      </main>

      <footer className="mt-12 border-t pt-4 text-xs text-muted-foreground">
        Números calculados pelo Boop Admin a partir dos lançamentos, contratos, negócios, tarefas e projetos. Financeiro no
        regime de caixa; no mês atual e nos futuros, inclui o que ainda vence. Imposto provisionado pela alíquota de{" "}
        {formatPercent(ctx.index.taxRate)}
        {ctx.finance.settings.tax_rate_confirmed ? "" : " (premissa a confirmar com o contador)"}.
      </footer>
    </div>
  )
}

function ReportTable({ head, rows, align, empty }: { head: string[]; rows: ReactNode[][]; align: ("left" | "right")[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted-foreground">{empty}</p>
  return (
    <table className="w-full text-[12.5px] tabular-nums">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {head.map((label, index) => (
            <th key={label} scope="col" className={cn("px-2 py-1.5 font-medium first:pl-0 last:pr-0", align[index] === "right" ? "text-right" : "text-left")}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b border-border/60">
            {row.map((cell, index) => (
              <td key={index} className={cn("px-2 py-1.5 first:pl-0 last:pr-0", align[index] === "right" ? "text-right whitespace-nowrap" : "text-left")}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Reais inteiros sem o símbolo (tabelas largas): 1.280.000 centavos → "12.800". */
function reais(cents: number): string {
  const value = Math.round(cents / 100)
  return `${value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("pt-BR")}`
}

function DreSection({ input }: { input: ReportInput }) {
  const months = input.dreMonths.map((period) => dreMonth(input.ctx.index, period))
  return (
    <Section id="dre" title={REPORT_SECTION_LABEL.dre}>
      <div className="report-block grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Receita bruta</p>
          <MoneyColumnChart
            ariaLabel="Receita bruta por mês"
            data={months.map((month) => ({
              key: month.period,
              label: monthName(month.period).slice(0, 3),
              title: periodLabel(month.period),
              value: month.status === "forecast" ? 0 : month.realizedRevenue,
              forecast: month.revenue - (month.status === "forecast" ? 0 : month.realizedRevenue),
              current: month.status === "current",
            }))}
            legend={{ realized: "Recebido", forecast: "Previsto" }}
            height={150}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Resultado</p>
          <MoneyColumnChart
            ariaLabel="Resultado por mês"
            data={months.map((month) => ({
              key: month.period,
              label: monthName(month.period).slice(0, 3),
              title: periodLabel(month.period),
              value: month.result,
              projected: month.status === "current" || month.status === "forecast",
              current: month.status === "current",
            }))}
            legend={{ realized: "Realizado", forecast: "Previsto" }}
            height={150}
          />
        </div>
      </div>
      <div className="report-block mt-5 overflow-x-auto">
        <p className="mb-1 text-[11px] text-muted-foreground">Valores em reais.</p>
        <table className="w-full min-w-max text-[11px] tabular-nums">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">Linha</th>
              {months.map((month) => (
                <th key={month.period} scope="col" className="px-1.5 py-1.5 text-right font-medium capitalize">
                  {monthName(month.period).slice(0, 3)}/{month.period.slice(2, 4)}
                </th>
              ))}
              <th scope="col" className="py-1.5 pl-1.5 text-right font-medium text-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {DRE_LINES.map((line) => {
              const strong = "strong" in line && line.strong
              const total = months.reduce((sum, month) => sum + (month[line.key] as number), 0)
              return (
                <tr key={line.key} className={cn("border-b border-border/60", strong && "font-semibold")}>
                  <th scope="row" className={cn("py-1.5 pr-2 text-left whitespace-nowrap", strong ? "font-semibold text-foreground" : "font-normal text-muted-foreground")}>
                    {line.label}
                  </th>
                  {months.map((month) => {
                    const value = line.sign * (month[line.key] as number)
                    return (
                      <td key={month.period} className={cn("px-1.5 py-1.5 text-right whitespace-nowrap", value < 0 && strong && "text-overdue")}>
                        {value === 0 ? "–" : reais(value)}
                      </td>
                    )
                  })}
                  <td className="py-1.5 pl-1.5 text-right whitespace-nowrap">{reais(line.sign * total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function ProjectionSection({ input }: { input: ReportInput }) {
  const months = projection(input.ctx.index, 12)
  const shares = allocation(input.ctx.index, input.ctx.index.current, months[months.length - 1]!.period)
  return (
    <Section id="projecao" title={REPORT_SECTION_LABEL.projecao}>
      <div className="report-block">
        <MoneyLineChart
          ariaLabel="MRR projetado"
          labels={months.map((month) => ({ label: monthName(month.period).slice(0, 3), title: periodLabel(month.period) }))}
          series={[{ key: "mrr", label: "MRR", values: months.map((month) => month.mrr), tone: "primary" }]}
          forecastFrom={1}
          area
          height={140}
        />
      </div>
      <div className="report-block mt-5">
        <ReportTable
          head={["Mês", "MRR", "Receita", "Resultado", "Caixa", "Reinvest.", "Pró-labore", "Caixa no fim"]}
          align={["left", "right", "right", "right", "right", "right", "right", "right"]}
          rows={months.map((month, index) => {
            const share = shares[index]
            return [
              periodLabel(month.period),
              formatMoneyShort(month.mrr),
              formatMoneyShort(month.dre.revenue),
              formatMoneyShort(month.dre.result),
              share ? formatMoneyShort(share.toReserve - share.deficit) : "—",
              share ? formatMoneyShort(share.toReinvest) : "—",
              share && share.toOwners > 0 ? `${formatMoneyShort(share.perPartner)} cada` : "—",
              share ? formatMoneyShort(share.reserveEnd) : "—",
            ]
          })}
        />
      </div>
    </Section>
  )
}

function CommercialSection({ input }: { input: ReportInput }) {
  const { ctx, period } = input
  const charts = commercialCharts(ctx, period)
  const leads = charts.funnel[0]?.count ?? 0
  const inPeriod = (day: string | null) => day !== null && day >= period.range.start && day <= period.range.end
  const deals = ctx.deals.filter((deal) => isOpenDeal(deal) || inPeriod(deal.closed_on))
  return (
    <Section id="comercial" title={REPORT_SECTION_LABEL.comercial}>
      <div className="report-block grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Funil dos leads do período</p>
          <BarList
            items={charts.funnel.map((step) => ({
              key: step.stage,
              label: step.label,
              value: step.count,
              display: `${step.count}${step.fromStart !== null && step.stage !== "lead" ? ` · ${formatPercent(step.fromStart, true)}` : ""}`,
            }))}
            max={leads}
            emptyText="Nenhum lead no período."
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Origem dos leads</p>
          <BarList
            items={charts.sources.map((row) => ({
              key: row.source,
              label: row.label,
              value: row.leads,
              display: `${row.leads} · ${row.won} ${row.won === 1 ? "ganho" : "ganhos"}`,
            }))}
            emptyText="Nenhum lead no período."
          />
        </div>
      </div>
      <div className="report-block mt-5">
        <ReportTable
          head={["Negócio", "Etapa", "Mensal", "Pontual", "Contrato", "Chance", "Fechamento"]}
          align={["left", "left", "right", "right", "right", "right", "right"]}
          rows={deals.map((deal) => [
            deal.title,
            DEAL_STAGE_LABEL[deal.stage],
            deal.recurring_cents > 0 ? formatMoneyShort(deal.recurring_cents) : "—",
            deal.one_time_cents > 0 ? formatMoneyShort(deal.one_time_cents) : "—",
            formatMoneyShort(contractValue(deal)),
            `${probabilityOf(deal)}%`,
            deal.closed_on ? formatShortDate(deal.closed_on) : deal.expected_close_on ? `prev. ${formatShortDate(deal.expected_close_on)}` : "—",
          ])}
          empty="Nenhum negócio em aberto ou fechado no período."
        />
      </div>
    </Section>
  )
}

function OperationalSection({ input }: { input: ReportInput }) {
  const charts = operationalCharts(input.ctx, input.period, input.profiles)
  return (
    <Section id="operacional" title={REPORT_SECTION_LABEL.operacional}>
      <div className="report-block grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Tarefas concluídas por mês</p>
          <CountColumnChart
            ariaLabel="Tarefas concluídas por mês"
            data={charts.months.map((month, index) => ({
              key: month.period,
              label: month.label,
              title: month.title,
              value: charts.tasksDone[index]!,
              current: month.current,
            }))}
            singular="tarefa"
            plural="tarefas"
            height={140}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Projetos com prazo vencido</p>
          <ReportTable
            head={["Projeto", "Cliente", "Atraso"]}
            align={["left", "left", "right"]}
            rows={charts.lateProjects.map((project) => [
              project.name,
              project.clientId ? (input.ctx.clients.find((client) => client.id === project.clientId)?.name ?? "") : "Interno",
              `${project.days} dias`,
            ])}
            empty="Nenhum projeto atrasado."
          />
        </div>
      </div>
    </Section>
  )
}
