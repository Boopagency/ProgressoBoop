"use client"

import { ArrowUpRight, ChevronLeft, ChevronRight, Download, Printer } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { BarList } from "@/components/charts/bar-list"
import { ColumnChart } from "@/components/charts/column-chart"
import { LineChart } from "@/components/charts/line-chart"
import { KpiTile } from "@/components/kpi-tile"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertList } from "@/features/finance/finance-ui"
import { formatMoney, formatMoneyAxis, formatMoneyShort } from "@/features/finance/money"
import type { MetricArea } from "@/features/metrics/catalog"
import type { Dashboard, MetricSnapshot } from "@/features/metrics/dashboard"
import { formatMetric, metricDelta } from "@/features/metrics/format"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface MetricsLinks {
  areas: { key: MetricArea | "overview"; label: string; href: string }[]
  kinds: { key: string; label: string; href: string; active: boolean }[]
  previous: string
  next: string
  today: string | null
  compare: { key: string; label: string; href: string; active: boolean }[]
  excel: string
  report: string
}

/** Tela Indicadores: os números da Boop num período, comparados, com a origem de cada um. */
export function MetricsView({ dashboard, area, links }: { dashboard: Dashboard; area: MetricArea | "overview"; links: MetricsLinks }) {
  const router = useRouter()
  const [selected, setSelected] = useState<MetricSnapshot | null>(null)
  const compareShort = `vs ${dashboard.comparison.short}`

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Indicadores"
        description="Financeiro, comercial e operação, calculados a partir dos dados do sistema"
        actions={
          <>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={links.excel}>
                <Download className="size-3.5" />
                Excel
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={links.report}>
                <Printer className="size-3.5" />
                Relatório
              </Link>
            </Button>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        <nav aria-label="Tipo de período" className="inline-flex rounded-lg bg-muted p-0.5">
          {links.kinds.map((kind) => (
            <Link
              key={kind.key}
              href={kind.href}
              scroll={false}
              aria-current={kind.active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground",
                kind.active && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
              )}
            >
              {kind.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" asChild aria-label="Período anterior">
            <Link href={links.previous} scroll={false}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-40 px-1 text-center font-display text-base font-semibold text-foreground">{dashboard.period.label}</h2>
          <Button variant="outline" size="icon-sm" asChild aria-label="Próximo período">
            <Link href={links.next} scroll={false}>
              <ChevronRight />
            </Link>
          </Button>
          {links.today ? (
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href={links.today} scroll={false}>
                Atual
              </Link>
            </Button>
          ) : null}
        </div>
        <Select value={links.compare.find((option) => option.active)?.key} onValueChange={(value) => {
          const target = links.compare.find((option) => option.key === value)
          if (target) router.push(target.href, { scroll: false })
        }}>
          <SelectTrigger size="sm" aria-label="Comparar com" className="h-8 w-auto shadow-none sm:ml-auto">
            <span className="text-muted-foreground">Comparar com</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {links.compare.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label="Áreas" className="-mx-4 mt-5 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {links.areas.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={item.key === area ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  item.key === area && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand"
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {dashboard.period.current || dashboard.period.future ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {dashboard.period.future
            ? "Período futuro: o financeiro mostra a previsão (contratos, custos fixos e lançamentos agendados)."
            : "Período em andamento: o financeiro soma o realizado e o que ainda vence até o fim do período, como no DRE."}
        </p>
      ) : null}

      <section aria-label="Indicadores" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dashboard.snapshots.map((snapshot) => (
          <KpiTile
            key={snapshot.key}
            label={snapshot.label}
            value={formatMetric(snapshot.value, snapshot.unit)}
            delta={metricDelta(snapshot.value, snapshot.previous, snapshot.unit, snapshot.better, compareShort)}
            trend={snapshot.trend}
            alert={isAlert(snapshot)}
            onSelect={() => setSelected(snapshot)}
          />
        ))}
      </section>

      {area === "overview" && dashboard.alerts.length > 0 ? (
        <PanelCard id="indicadores-alertas" title="Pede atenção" className="mt-6">
          <AlertList alerts={dashboard.alerts} />
        </PanelCard>
      ) : null}

      {dashboard.financial && area !== "overview" ? <FinancialSection charts={dashboard.financial} /> : null}
      {dashboard.financial && area === "overview" ? <OverviewCharts charts={dashboard.financial} /> : null}
      {dashboard.commercial ? <CommercialSection charts={dashboard.commercial} /> : null}
      {dashboard.operational ? <OperationalSection charts={dashboard.operational} /> : null}

      <MetricSheet snapshot={selected} period={dashboard.period.label} comparison={dashboard.comparison.label} onOpenChange={(open) => !open && setSelected(null)} />
    </PageContainer>
  )
}

/** Número que pede atenção: atrasos e resultado negativo. */
function isAlert(snapshot: MetricSnapshot): boolean {
  if (snapshot.value === null) return false
  if (snapshot.key === "result" || snapshot.key === "cash_balance") return snapshot.value < 0
  if (["receivables_overdue", "tasks_overdue", "projects_late", "clients_at_risk"].includes(snapshot.key)) return snapshot.value > 0
  return false
}

function OverviewCharts({ charts }: { charts: NonNullable<Dashboard["financial"]> }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <PanelCard id="visao-receita" title="Faturamento por mês">
        <div className="px-4 pt-4 pb-3">
          <ColumnChart
            ariaLabel="Faturamento por mês"
            data={charts.months.map((month, index) => ({
              key: month.period,
              label: month.label,
              title: month.title,
              value: charts.revenue[index]!.realized,
              forecast: charts.revenue[index]!.forecast,
              current: month.current,
              href: `/financeiro/lancamentos?mes=${month.period.slice(0, 7)}&conta=client_revenue,other_revenue`,
            }))}
            format={formatMoney}
            axisFormat={formatMoneyAxis}
            legend={{ realized: "Recebido", forecast: "Previsto" }}
          />
        </div>
      </PanelCard>
      <PanelCard id="visao-resultado" title="Resultado por mês">
        <div className="px-4 pt-4 pb-3">
          <ColumnChart
            ariaLabel="Resultado por mês"
            data={charts.months.map((month, index) => ({
              key: month.period,
              label: month.label,
              title: month.title,
              value: charts.result[index]!.value,
              projected: charts.result[index]!.projected,
              current: month.current,
            }))}
            format={formatMoney}
            axisFormat={formatMoneyAxis}
            legend={{ realized: "Realizado", forecast: "Previsto" }}
          />
        </div>
      </PanelCard>
    </div>
  )
}

function FinancialSection({ charts }: { charts: NonNullable<Dashboard["financial"]> }) {
  const { clientById } = useWorkspace()
  return (
    <>
      <OverviewCharts charts={charts} />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PanelCard id="grafico-mrr-indicadores" title="Receita recorrente (MRR)" className="lg:col-span-1">
          <div className="px-4 pt-4 pb-3">
            <LineChart
              ariaLabel="MRR nos últimos 12 meses"
              labels={charts.months.map((month) => ({ label: month.label, title: month.title, current: month.current }))}
              series={[{ key: "mrr", label: "MRR", values: charts.mrr, tone: "primary" }]}
              format={formatMoney}
              axisFormat={formatMoneyAxis}
              area
              height={160}
            />
          </div>
        </PanelCard>
        <PanelCard id="concentracao" title="Receita por cliente">
          <div className="px-4 py-3">
            <BarList
              items={charts.clients.map((row) => ({
                key: row.clientId,
                label: clientById.get(row.clientId)?.name ?? "Cliente",
                value: row.mrr,
                display: `${formatMoneyShort(row.mrr)} · ${formatPercent(row.share, true)}`,
                href: `/clientes/${row.clientId}`,
              }))}
              emptyText="Nenhum contrato no período."
            />
            <p className="mt-3 text-xs text-muted-foreground">Participação de cada cliente no MRR. Acima de 50% num só, a receita está concentrada.</p>
          </div>
        </PanelCard>
        <PanelCard id="idade-recebiveis" title="A receber em atraso">
          <div className="px-4 py-3">
            <BarList
              items={charts.aging.map((bucket) => ({
                key: bucket.label,
                label: bucket.label,
                value: bucket.total,
                display: bucket.count > 0 ? `${formatMoneyShort(bucket.total)} · ${bucket.count}` : "—",
                tone: "negative" as const,
              }))}
            />
            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              Total vencido: {formatMoney(charts.overdueTotal)}.{" "}
              <Link href="/financeiro/lancamentos?situacao=atrasado&conta=client_revenue,other_revenue" className="font-medium text-foreground hover:underline">
                Ver lançamentos
              </Link>
            </p>
          </div>
        </PanelCard>
      </div>
    </>
  )
}

function CommercialSection({ charts }: { charts: NonNullable<Dashboard["commercial"]> }) {
  const leads = charts.funnel[0]?.count ?? 0
  return (
    <>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PanelCard id="funil" title="Funil do período">
          <div className="px-4 py-3">
            <BarList
              items={charts.funnel.map((step) => ({
                key: step.stage,
                label: step.label,
                value: step.count,
                display: `${step.count}${step.fromStart !== null && step.stage !== "lead" ? ` · ${formatPercent(step.fromStart, true)}` : ""}`,
                hint: step.fromPrevious !== null && step.stage !== "lead" ? `${formatPercent(step.fromPrevious, true)} da etapa anterior` : undefined,
              }))}
              max={leads}
              emptyText="Nenhum lead no período."
            />
            <p className="mt-3 text-xs text-muted-foreground">Leads que chegaram no período, pela etapa mais avançada que alcançaram.</p>
          </div>
        </PanelCard>
        <PanelCard id="origens" title="Origem dos leads">
          <div className="px-4 py-3">
            <BarList
              items={charts.sources.map((row) => ({
                key: row.source,
                label: row.label,
                value: row.leads,
                display: `${row.leads} ${row.leads === 1 ? "lead" : "leads"}`,
                hint: row.won > 0 ? `${row.won} ${row.won === 1 ? "ganho" : "ganhos"} · ${formatMoneyShort(row.wonValue)} · conversão ${formatPercent(row.conversion, true)}` : "nenhum ganho ainda",
              }))}
              emptyText="Nenhum lead no período."
            />
          </div>
        </PanelCard>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PanelCard id="leads-por-mes" title="Leads e ganhos por mês">
          <div className="px-4 pt-4 pb-3">
            <LineChart
              ariaLabel="Leads e ganhos por mês"
              labels={charts.months.map((month) => ({ label: month.label, title: month.title, current: month.current }))}
              series={[
                { key: "leads", label: "Leads", values: charts.leads, tone: "primary" },
                { key: "won", label: "Ganhos", values: charts.won, tone: "secondary" },
              ]}
              format={(value) => String(value)}
              axisFormat={(value) => String(value)}
              height={170}
            />
          </div>
        </PanelCard>
        <PanelCard id="previstos" title="Fechamentos previstos">
          <div className="px-4 py-3">
            <BarList
              items={charts.expected.map((row) => ({
                key: row.period,
                label: row.title,
                value: row.weighted,
                display: formatMoneyShort(row.weighted),
                hint: row.count > 0 ? `${row.count} ${row.count === 1 ? "negócio" : "negócios"} · ${formatMoneyShort(row.recurring)}/mês ponderado` : "nenhum previsto",
              }))}
            />
            <p className="mt-3 text-xs text-muted-foreground">Valor dos negócios em aberto × chance, pela previsão de fechamento.</p>
          </div>
        </PanelCard>
      </div>
    </>
  )
}

function OperationalSection({ charts }: { charts: NonNullable<Dashboard["operational"]> }) {
  const { clientById } = useWorkspace()
  const max = Math.max(1, ...charts.workload.map((row) => row.open))
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <PanelCard id="tarefas-por-mes" title="Tarefas concluídas por mês" className="lg:col-span-2">
        <div className="px-4 pt-4 pb-3">
          <ColumnChart
            ariaLabel="Tarefas concluídas por mês"
            data={charts.months.map((month, index) => ({
              key: month.period,
              label: month.label,
              title: month.title,
              value: charts.tasksDone[index]!,
              current: month.current,
            }))}
            format={(value) => `${value} ${value === 1 ? "tarefa" : "tarefas"}`}
            axisFormat={(value) => String(value)}
          />
        </div>
      </PanelCard>
      <PanelCard id="carga" title="Tarefas abertas por pessoa">
        <div className="px-4 py-3">
          <BarList
            items={charts.workload.map((row) => ({
              key: row.profileId,
              label: firstName(row.name),
              value: row.open,
              display: String(row.open),
              hint: row.overdue > 0 ? `${row.overdue} atrasada${row.overdue === 1 ? "" : "s"}` : "nenhuma atrasada",
              href: `/tarefas?pessoa=${row.profileId}`,
            }))}
            max={max}
          />
        </div>
      </PanelCard>
      {charts.lateProjects.length > 0 ? (
        <PanelCard id="projetos-atrasados" title="Projetos com prazo vencido" className="lg:col-span-3">
          <ul className="divide-y">
            {charts.lateProjects.map((project) => (
              <li key={project.id}>
                <Link href={`/projetos/${project.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{project.name}</span>
                    <span className="block text-xs text-muted-foreground">{project.clientId ? clientById.get(project.clientId)?.name : "Interno"}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-overdue tabular-nums">{project.days} dias</span>
                </Link>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
    </div>
  )
}

function MetricSheet({
  snapshot,
  period,
  comparison,
  onOpenChange,
}: {
  snapshot: MetricSnapshot | null
  period: string
  comparison: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={snapshot !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        {snapshot ? (
          <>
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>{snapshot.label}</SheetTitle>
              <SheetDescription>{period}</SheetDescription>
            </SheetHeader>
            <div className="px-5 py-4">
              <p className="font-display text-3xl font-semibold tracking-tight text-foreground">{formatMetric(snapshot.value, snapshot.unit, true)}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {comparison}: {formatMetric(snapshot.previous, snapshot.unit, true)}
              </p>
              <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{snapshot.formula}</p>
              {snapshot.trend.some((value) => value !== null) ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Últimos 12 meses</p>
                  <ColumnChart
                    ariaLabel={`${snapshot.label} nos últimos 12 meses`}
                    data={snapshot.trend.map((value, index) => {
                      const last = index === snapshot.trend.length - 1
                      const partial = last ? snapshot.trendCurrent : null
                      const total = value ?? 0
                      return {
                        key: snapshot.trendLabels[index]!,
                        label: snapshot.trendLabels[index]!.slice(0, 3).toLocaleLowerCase("pt-BR"),
                        title: snapshot.trendLabels[index]!,
                        value: partial?.split ? partial.realized : total,
                        forecast: partial?.split ? total - partial.realized : undefined,
                        projected: Boolean(partial && !partial.split),
                        current: last,
                      }
                    })}
                    format={(value) => formatMetric(value, snapshot.unit, true)}
                    axisFormat={(value) => (snapshot.unit === "money" ? formatMoneyAxis(value) : formatMetric(value, snapshot.unit))}
                    legend={{ realized: "Realizado", forecast: "Previsto no mês atual" }}
                    height={140}
                  />
                </div>
              ) : null}
              <div className="mt-5">
                <p className="text-xs font-medium text-muted-foreground">
                  De onde vem o número {snapshot.details.total > 0 ? `(${snapshot.details.total})` : ""}
                </p>
                {snapshot.details.rows.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">Nada no período.</p>
                ) : (
                  <ul className="mt-2 divide-y rounded-lg border">
                    {snapshot.details.rows.map((row) => {
                      const content = (
                        <>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-foreground">{row.label}</span>
                            {row.sublabel ? <span className="block truncate text-xs text-muted-foreground">{row.sublabel}</span> : null}
                          </span>
                          <span className="shrink-0 text-[13px] text-foreground tabular-nums">{row.value}</span>
                        </>
                      )
                      return (
                        <li key={row.key}>
                          {row.href ? (
                            <Link href={row.href} className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
                              {content}
                            </Link>
                          ) : (
                            <div className="flex items-center justify-between gap-3 px-3 py-2">{content}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {snapshot.details.total > snapshot.details.rows.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">Mostrando {snapshot.details.rows.length} de {snapshot.details.total}.</p>
                ) : null}
                {snapshot.details.note ? <p className="mt-2 text-xs text-muted-foreground">{snapshot.details.note}</p> : null}
              </div>
              {snapshot.href ? (
                <Button variant="outline" size="sm" asChild className="mt-5 gap-1.5">
                  <Link href={snapshot.href}>
                    Abrir os dados de origem
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
