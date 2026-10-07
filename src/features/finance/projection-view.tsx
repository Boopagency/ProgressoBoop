"use client"

import { useMemo } from "react"

import { LineChart } from "@/components/charts/line-chart"
import { KpiTile } from "@/components/kpi-tile"
import { PanelCard } from "@/components/panel-card"
import { Progress } from "@/components/ui/progress"
import { addPeriods, monthName, periodLabel } from "@/features/clients/logic"
import { AlertList, MoneyLine } from "@/features/finance/finance-ui"
import {
  allocation,
  financeAlerts,
  indexFinance,
  mrr,
  nextMrrDrop,
  periodsFrom,
  projection,
  requiredRevenue,
  reserveTarget,
  type AllocationRule,
  type FinanceData,
} from "@/features/finance/management"
import { formatMoney, formatMoneyAxis, formatMoneyDelta, formatMoneyShort } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatPercent } from "@/lib/format"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const RULE_SHORT: Record<AllocationRule, string> = {
  negative: "Negativo",
  building: "Formando caixa",
  split: "Dividindo",
}

const HISTORY_MONTHS = 6
const AHEAD_MONTHS = 12

/** Aba Projeção: os próximos 12 meses, o caixa e quanto falta para o alvo de pró-labore. */
export function ProjectionView({ data, today }: { data: FinanceData; today: DateKey }) {
  const { clientById } = useWorkspace()
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const months = projection(index, AHEAD_MONTHS)
  const last = months[months.length - 1]!
  const drop = nextMrrDrop(months)
  const target = reserveTarget(index)
  const split = allocation(index, index.current, last.period)
  const chainStart = data.settings.opening_on
  const chain = allocation(index, chainStart, last.period)
  const needed = requiredRevenue(index)
  const alerts = financeAlerts(index, (id) => clientById.get(id)?.name ?? "cliente").filter(
    (alert) => alert.key === "mrr-drop" || alert.key === "negative-reserve" || alert.key.startsWith("ending-")
  )
  const resultSum = months.reduce((sum, month) => sum + month.dre.result, 0)
  const lastReserve = split[split.length - 1]?.reserveEnd ?? 0

  // MRR: seis meses para trás (contratados) e doze para a frente.
  const mrrPeriods = periodsFrom(addPeriods(index.current, -HISTORY_MONTHS), HISTORY_MONTHS + AHEAD_MONTHS)
  const mrrValues = mrrPeriods.map((period) => mrr(index, period))

  return (
    <div>
      <section aria-label="Resumo da projeção" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="MRR hoje"
          value={formatMoney(months[0]!.mrr)}
          hint={`${months[0]!.contracts} ${months[0]!.contracts === 1 ? "contrato ativo" : "contratos ativos"}`}
        />
        <KpiTile
          label={`MRR em ${monthName(last.period)}/${last.period.slice(2, 4)}`}
          value={formatMoney(last.mrr)}
          alert={last.mrr < months[0]!.mrr}
          hint={drop ? `primeira queda em ${monthName(drop.period)} (${formatMoneyDelta(drop.change)})` : "sem quedas previstas"}
        />
        <KpiTile
          label="Resultado previsto (12 meses)"
          value={formatMoney(resultSum)}
          alert={resultSum < 0}
          hint={`${months.filter((month) => month.dre.result < 0).length} meses no vermelho`}
        />
        <KpiTile
          label={`Caixa em ${monthName(last.period)}/${last.period.slice(2, 4)}`}
          value={formatMoney(lastReserve)}
          alert={lastReserve < 0}
          hint={`mínimo: ${formatMoneyShort(target)} (${data.settings.reserve_months} meses de custo fixo)`}
        />
      </section>

      {alerts.length > 0 ? (
        <PanelCard id="projecao-alertas" title="O que muda nos próximos meses" className="mt-6">
          <AlertList alerts={alerts} />
        </PanelCard>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <PanelCard id="grafico-mrr" title="Receita recorrente (MRR)">
          <div className="px-4 pt-4 pb-3">
            <LineChart
              ariaLabel="MRR nos últimos 6 meses e nos próximos 12"
              labels={mrrPeriods.map((period) => ({
                label: monthName(period).slice(0, 3),
                title: periodLabel(period),
                current: period === index.current,
              }))}
              series={[{ key: "mrr", label: "MRR", values: mrrValues, tone: "primary" }]}
              forecastFrom={HISTORY_MONTHS + 1}
              format={formatMoney}
              axisFormat={formatMoneyAxis}
              area
            />
            <p className="mt-2 text-xs text-muted-foreground">Soma dos contratos de clientes que valem em cada mês. O trecho claro é a previsão.</p>
          </div>
        </PanelCard>
        <PanelCard id="grafico-caixa" title="Caixa acumulado">
          <div className="px-4 pt-4 pb-3">
            <LineChart
              ariaLabel="Caixa acumulado pela divisão do resultado, com o caixa mínimo"
              labels={chain.map((month) => ({
                label: monthName(month.period).slice(0, 3),
                title: periodLabel(month.period),
                current: month.period === index.current,
              }))}
              series={[{ key: "caixa", label: "Caixa", values: chain.map((month) => month.reserveEnd), tone: "primary" }]}
              forecastFrom={chain.findIndex((month) => month.period >= index.current)}
              reference={target > 0 ? { value: target, label: `Mínimo ${formatMoneyShort(target)}` } : undefined}
              format={formatMoney}
              axisFormat={formatMoneyAxis}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Saldo inicial + o que a divisão do resultado manda para o caixa − meses negativos + aportes.
            </p>
          </div>
        </PanelCard>
        <PanelCard id="receita-necessaria" title="Receita necessária">
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Para pagar {formatMoneyShort(data.settings.owner_draw_target_cents)} de pró-labore a cada um dos {data.settings.partners} sócios:
            </p>
            <dl className="mt-2">
              <MoneyLine label="Pró-labore total" value={formatMoney(needed.ownerTarget)} />
              <MoneyLine label="Resultado necessário" value={formatMoney(needed.resultNeeded)} />
              <MoneyLine label="Custos fixos por mês" value={formatMoney(needed.fixedMonthly)} />
              <MoneyLine
                label="Deduções da receita"
                value={formatPercent(index.taxRate + index.gatewayRate + needed.directRatio)}
                tone="muted"
              />
              <div className="mt-1 border-t pt-1">
                <MoneyLine label="Receita mensal necessária" value={needed.required === null ? "—" : formatMoney(needed.required)} strong />
                <MoneyLine label="MRR atual" value={formatMoney(needed.mrr)} />
              </div>
            </dl>
            {needed.required !== null ? (
              <>
                <Progress
                  value={needed.required > 0 ? Math.min(100, (needed.mrr / needed.required) * 100) : 100}
                  aria-label="MRR em relação à receita necessária"
                  className="mt-3 h-1.5"
                />
                <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {needed.gap && needed.gap > 0
                    ? `Faltam ${formatMoney(needed.gap)} por mês (${formatPercent(needed.required > 0 ? needed.mrr / needed.required : null, true)} do caminho).`
                    : "O MRR já cobre o alvo."}
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-overdue">As deduções passam de 100% da receita: revise os parâmetros.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Deduções: imposto {formatPercent(index.taxRate)}, gateway {formatPercent(index.gatewayRate)} e custos diretos{" "}
              {formatPercent(needed.directRatio)} da receita.
            </p>
          </div>
        </PanelCard>
      </div>

      <div className="mt-6">
        <PanelCard id="projecao-tabela" title="Mês a mês">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px] whitespace-nowrap tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Mês</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">MRR</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Receita</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Resultado</th>
                  <th scope="col" className="px-3 py-2 font-medium">Regra</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Caixa</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Reinvest.</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Pró-labore</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Caixa no fim</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month, position) => {
                  const share = split[position]
                  return (
                    <tr key={month.period} className={cn("border-t", month.period === index.current && "bg-accent/40")}>
                      <th scope="row" className="px-4 py-2 text-left font-normal whitespace-nowrap">
                        <span className="text-foreground capitalize">{monthName(month.period)}</span>
                        <span className="text-muted-foreground">/{month.period.slice(2, 4)}</span>
                        {month.ending.length > 0 ? (
                          <span className="ml-2 text-[11px] text-warning-ink" title={month.ending.map((recurrence) => recurrence.description).join(", ")}>
                            {month.ending.length === 1 ? "1 contrato acaba" : `${month.ending.length} contratos acabam`}
                          </span>
                        ) : null}
                      </th>
                      <td className="px-3 py-2 text-right">
                        {formatMoneyShort(month.mrr)}
                        {month.mrrChange !== 0 && position > 0 ? (
                          <span className={cn("block text-[11px]", month.mrrChange < 0 ? "text-overdue" : "text-success-ink")}>{formatMoneyDelta(month.mrrChange)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoneyShort(month.dre.revenue)}</td>
                      <td className={cn("px-3 py-2 text-right font-medium", month.dre.result < 0 ? "text-overdue" : "text-foreground")}>
                        {formatMoneyShort(month.dre.result)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{share ? RULE_SHORT[share.rule] : "—"}</td>
                      <td className={cn("px-3 py-2 text-right", share && share.deficit > 0 ? "text-overdue" : "")}>
                        {share ? formatMoneyShort(share.toReserve - share.deficit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{share ? formatMoneyShort(share.toReinvest) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {share && share.toOwners > 0 ? (
                          <>
                            {formatMoneyShort(share.toOwners)}
                            <span className="block text-[11px] text-muted-foreground">{formatMoneyShort(share.perPartner)} cada</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cn("px-4 py-2 text-right font-medium", share && share.reserveEnd < 0 ? "text-overdue" : "text-foreground")}>
                        {share ? formatMoneyShort(share.reserveEnd) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Divisão do resultado (aba DIVISÃO DO RESULTADO da planilha): mês negativo → o caixa cobre; caixa abaixo do
            mínimo → todo o resultado vai para o caixa; mínimo atingido → {formatPercent(data.settings.reserve_share_bps / 10000)} caixa,{" "}
            {formatPercent(data.settings.reinvest_share_bps / 10000)} reinvestimento e o resto em pró-labore, dividido entre os{" "}
            {data.settings.partners} sócios.
          </p>
        </PanelCard>
      </div>
    </div>
  )
}
