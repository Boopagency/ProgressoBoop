"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { ColumnChart } from "@/components/charts/column-chart"
import { KpiTile } from "@/components/kpi-tile"
import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { monthName, periodLabel } from "@/features/clients/logic"
import { ledgerHref, StatusChip } from "@/features/finance/finance-ui"
import {
  DRE_LINE_ACCOUNTS,
  DRE_LINES,
  dreMonths,
  indexFinance,
  sumDre,
  type DreMonth,
  type FinanceData,
} from "@/features/finance/management"
import { formatMoney, formatMoneyAxis, formatMoneyShort } from "@/features/finance/money"
import { formatPercent } from "@/lib/format"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface RangeOption {
  key: string
  label: string
  href: string
}

/** Linhas fora do resultado (movimentos de caixa que o DRE não conta). */
const OUTSIDE_LINES = [
  { key: "ownerContributions", label: "Aportes de sócios", account: "owner_contribution", sign: 1 },
  { key: "taxPaid", label: "Imposto (DAS)", account: "tax", sign: -1 },
  { key: "ownerDraws", label: "Pró-labore", account: "owner_draw", sign: -1 },
  { key: "reinvestments", label: "Reinvestimentos", account: "reinvestment", sign: -1 },
] as const

const COMPUTED_HINT: Partial<Record<(typeof DRE_LINES)[number]["key"], string>> = {
  tax: "Provisão pela alíquota dos parâmetros sobre a receita bruta.",
  fees: "Realizado: as taxas lançadas. Previsto: a taxa média do gateway sobre a receita.",
  contribution: "Receita − imposto − taxas − custos diretos.",
  result: "Margem de contribuição − custos fixos − outras despesas.",
}

/** Aba DRE: mês a mês no regime de caixa, com gráficos e a origem de cada número. */
export function DreView({
  data,
  today,
  periods,
  rangeKey,
  options,
}: {
  data: FinanceData
  today: DateKey
  periods: DateKey[]
  rangeKey: string
  options: RangeOption[]
}) {
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const months = dreMonths(index, periods)
  const total = sumDre(months)
  const realized = months.filter((month) => month.status === "closed" || month.status === "realized")
  const realizedTotal = sumDre(realized)
  const exportHref = `/api/relatorios/excel?secoes=dre&de=${periods[0]!.slice(0, 7)}&ate=${periods[periods.length - 1]!.slice(0, 7)}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Período" className="inline-flex rounded-lg bg-muted p-0.5">
          {options.map((option) => (
            <Link
              key={option.key}
              href={option.href}
              scroll={false}
              aria-current={option.key === rangeKey ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                option.key === rangeKey && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={exportHref}>
            <Download className="size-3.5" />
            Excel
          </a>
        </Button>
      </div>

      <section aria-label="Resumo do período" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Receita bruta no período"
          value={formatMoney(total.revenue)}
          hint={`${formatMoneyShort(realizedTotal.revenue)} realizados · ${formatMoneyShort(total.revenue - realizedTotal.revenue)} previstos`}
        />
        <KpiTile
          label="Resultado no período"
          value={formatMoney(total.result)}
          alert={total.result < 0}
          hint={`margem líquida ${formatPercent(total.margin)}`}
        />
        <KpiTile
          label="Margem de contribuição"
          value={formatPercent(total.contributionMargin)}
          hint={`${formatMoneyShort(total.contribution)} depois de imposto, taxas e custos diretos`}
        />
        <KpiTile
          label="Resultado médio por mês"
          value={formatMoney(Math.round(total.result / Math.max(1, months.length)))}
          alert={total.result < 0}
          hint={`${months.filter((month) => month.result < 0).length} de ${months.length} meses no vermelho`}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PanelCard id="grafico-receita" title="Receita bruta por mês">
          <div className="px-4 pt-4 pb-3">
            <ColumnChart
              ariaLabel="Receita bruta por mês"
              data={months.map((month) => ({
                key: month.period,
                label: monthName(month.period).slice(0, 3),
                title: periodLabel(month.period),
                value: month.status === "forecast" ? 0 : month.realizedRevenue,
                forecast: month.revenue - (month.status === "forecast" ? 0 : month.realizedRevenue),
                current: month.status === "current",
                href: ledgerHref({ mes: month.period, contas: DRE_LINE_ACCOUNTS.revenue }),
              }))}
              format={formatMoney}
              axisFormat={formatMoneyAxis}
              legend={{ realized: "Recebido", forecast: "Previsto" }}
            />
          </div>
        </PanelCard>
        <PanelCard id="grafico-resultado" title="Resultado por mês">
          <div className="px-4 pt-4 pb-3">
            <ColumnChart
              ariaLabel="Resultado por mês"
              data={months.map((month) => ({
                key: month.period,
                label: monthName(month.period).slice(0, 3),
                title: periodLabel(month.period),
                value: month.result,
                projected: month.status === "current" || month.status === "forecast",
                current: month.status === "current",
                details: [{ label: "Margem", value: formatPercent(month.margin) }],
              }))}
              format={formatMoney}
              axisFormat={formatMoneyAxis}
              legend={{ realized: "Realizado", forecast: "Previsto" }}
            />
          </div>
        </PanelCard>
      </div>

      <PanelCard id="dre-tabela" title="DRE mês a mês" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[13px] tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                  Linha
                </th>
                {months.map((month) => (
                  <th key={month.period} scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="block text-foreground capitalize">{monthName(month.period).slice(0, 3)}/{month.period.slice(2, 4)}</span>
                    <StatusChip status={month.status} className="mt-1" />
                  </th>
                ))}
                <th scope="col" className="bg-muted/40 px-4 py-2 text-right font-medium text-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {DRE_LINES.map((line) => {
                const accounts = DRE_LINE_ACCOUNTS[line.key]
                const strong = "strong" in line && line.strong
                return (
                  <tr key={line.key} className={cn(strong && "font-medium")}>
                    <th
                      scope="row"
                      title={COMPUTED_HINT[line.key]}
                      className={cn(
                        "sticky left-0 z-10 border-t bg-card px-4 py-2 text-left font-normal whitespace-nowrap",
                        strong ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {line.label}
                    </th>
                    {months.map((month) => (
                      <DreCell
                        key={month.period}
                        value={line.sign * (month[line.key] as number)}
                        href={accounts.length > 0 ? ledgerHref({ mes: month.period, contas: accounts }) : undefined}
                        strong={Boolean(strong)}
                      />
                    ))}
                    <DreCell value={line.sign * (total[line.key] as number)} strong={Boolean(strong)} total />
                  </tr>
                )
              })}
              <PercentRow label="Margem de contribuição (%)" months={months} pick={(month) => month.contributionMargin} total={total.contributionMargin} />
              <PercentRow label="Margem líquida (%)" months={months} pick={(month) => month.margin} total={total.margin} />
              <tr>
                <th scope="row" colSpan={months.length + 2} className="sticky left-0 border-t bg-muted/40 px-4 pt-3 pb-1 text-left text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">
                  Fora do resultado (só caixa)
                </th>
              </tr>
              {OUTSIDE_LINES.map((line) => (
                <tr key={line.key}>
                  <th scope="row" className="sticky left-0 z-10 border-t bg-card px-4 py-2 text-left font-normal whitespace-nowrap text-muted-foreground">
                    {line.label}
                  </th>
                  {months.map((month) => (
                    <DreCell
                      key={month.period}
                      value={line.sign * month[line.key]}
                      href={ledgerHref({ mes: month.period, contas: [line.account] })}
                    />
                  ))}
                  <DreCell value={line.sign * total[line.key]} total />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Regime de caixa, como na planilha: meses passados mostram o que foi recebido e pago; o mês atual soma o que
          ainda vence; os próximos mostram contratos, custos fixos e lançamentos agendados. Clique num valor para ver
          os lançamentos.
        </p>
      </PanelCard>
    </div>
  )
}

function DreCell({ value, href, strong = false, total = false }: { value: number; href?: string; strong?: boolean; total?: boolean }) {
  const text = value === 0 ? "—" : formatMoney(value)
  const className = cn(
    "border-t px-3 py-2 text-right whitespace-nowrap",
    total && "bg-muted/40 px-4",
    value < 0 && strong ? "text-overdue" : value === 0 ? "text-subtle-foreground" : strong ? "text-foreground" : "text-foreground/90"
  )
  return (
    <td className={className}>
      {href && value !== 0 ? (
        <Link href={href} className="rounded-sm underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        text
      )}
    </td>
  )
}

function PercentRow({
  label,
  months,
  pick,
  total,
}: {
  label: string
  months: DreMonth[]
  pick: (month: DreMonth) => number | null
  total: number | null
}) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-t bg-card px-4 py-2 text-left font-normal whitespace-nowrap text-muted-foreground">
        {label}
      </th>
      {months.map((month) => {
        const value = pick(month)
        return (
          <td key={month.period} className={cn("border-t px-3 py-2 text-right", value !== null && value < 0 ? "text-overdue" : "text-muted-foreground")}>
            {formatPercent(value)}
          </td>
        )
      })}
      <td className={cn("border-t bg-muted/40 px-4 py-2 text-right font-medium", total !== null && total < 0 ? "text-overdue" : "text-foreground")}>
        {formatPercent(total)}
      </td>
    </tr>
  )
}
