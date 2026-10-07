"use client"

import { Plus, Wallet } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { KpiTile } from "@/components/kpi-tile"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { periodOf } from "@/features/clients/logic"
import { FinanceRows } from "@/features/finance/finance-rows"
import { useFinanceDialog } from "@/features/finance/finance-shell"
import { AlertList, ledgerHref, MoneyLine, MonthNav, StatusChip } from "@/features/finance/finance-ui"
import { monthItems, overdueItems } from "@/features/finance/logic"
import {
  allocation,
  DRE_LINE_ACCOUNTS,
  dreMonth,
  financeAlerts,
  indexFinance,
  ledgerBalance,
  mrr,
  mrrMovement,
  type FinanceData,
} from "@/features/finance/management"
import { formatMoney, formatMoneyDelta, formatMoneyShort } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { monthRangeOf } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import type { DateKey } from "@/lib/types"

const RULE_LABEL = {
  negative: "Resultado negativo: nada é dividido e o caixa cobre a diferença.",
  building: "Caixa abaixo do mínimo: todo o resultado vai para o caixa.",
  split: "Caixa mínimo atingido: o resultado é dividido.",
} as const

/** Aba Mês: o que entra e sai no mês, o resultado dele e o que pede atenção. */
export function FinanceView({ data, period, today }: { data: FinanceData; period: DateKey; today: DateKey }) {
  const { clientById } = useWorkspace()
  const { openItem, openNew } = useFinanceDialog()
  const current = periodOf(today)
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const dre = dreMonth(index, period)
  const items = monthItems(data.entries, data.recurrences, period)
  const income = items.filter((item) => item.kind === "income")
  const expense = items.filter((item) => item.kind === "expense")
  const overdue = period === current ? overdueItems(data.entries, data.recurrences, today) : []
  const overdueIncome = overdue.filter((item) => item.kind === "income")
  const overdueExpense = overdue.filter((item) => item.kind === "expense")
  const end = monthRangeOf(period).end
  const balanceDay = period < current ? end : today
  const balance = ledgerBalance(index, balanceDay)
  const closing = data.closings.find((candidate) => candidate.period === period) ?? null
  const monthlyRecurring = mrr(index, period)
  const movement = mrrMovement(index, period)
  const mrrChange = movement.added - movement.churned + movement.changed
  const split = period >= data.settings.opening_on ? allocation(index, period, period)[0] : undefined
  const alerts = period === current ? financeAlerts(index, (id) => clientById.get(id)?.name ?? "cliente") : []
  const costs = dre.revenue - dre.result
  const pendingRevenue = dre.revenue - dre.realizedRevenue
  const empty = data.entries.length === 0 && data.recurrences.length === 0
  const sum = (list: typeof overdue) => list.reduce((total, item) => total + item.amount_cents, 0)

  return (
    <div>
      <MonthNav period={period} current={current} basePath="/financeiro" />

      {empty ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Wallet className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-semibold">Comece pelos contratos e pelos custos fixos</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Lance cada mensalidade de cliente como receita que se repete todo mês e cada custo fixo como despesa. Depois é
            só marcar o que entrou e saiu: resultado, margem, caixa e projeção se calculam sozinhos.
          </p>
          <Button size="sm" className="mt-5" onClick={() => openNew()}>
            Primeiro lançamento
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="Resumo do mês" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Receita bruta"
              value={formatMoney(dre.revenue)}
              href={ledgerHref({ mes: period, contas: DRE_LINE_ACCOUNTS.revenue })}
              hint={
                dre.status === "current"
                  ? `${formatMoneyShort(dre.realizedRevenue)} recebidos · ${formatMoneyShort(pendingRevenue)} a receber`
                  : dre.status === "forecast"
                    ? `prevista · ${formatMoneyShort(monthlyRecurring)} de contratos`
                    : `recebida no mês · ${formatMoneyShort(monthlyRecurring)} de contratos`
              }
              footer={
                dre.status === "current" && dre.revenue > 0 ? (
                  <Progress value={(dre.realizedRevenue / dre.revenue) * 100} aria-label="Recebido do mês" className="mt-2 h-1" />
                ) : null
              }
            />
            <KpiTile
              label="Custos e despesas"
              value={formatMoney(costs)}
              href={ledgerHref({ mes: period, contas: ["direct_cost", "fixed_cost", "other_expense"] })}
              hint={`inclui ${formatMoneyShort(dre.tax)} de imposto e ${formatMoneyShort(dre.fees)} de taxas`}
            />
            <KpiTile
              label={dre.status === "forecast" ? "Resultado previsto" : "Resultado do mês"}
              value={formatMoney(dre.result)}
              alert={dre.result < 0}
              href="/financeiro/dre"
              hint={`margem ${formatPercent(dre.margin)} · contribuição ${formatPercent(dre.contributionMargin)}`}
            />
            <KpiTile
              label="Saldo em conta"
              value={formatMoney(closing ? closing.bank_balance_cents : balance)}
              alert={(closing ? closing.bank_balance_cents : balance) < 0}
              href="/financeiro/fechamento"
              hint={
                closing
                  ? "conferido com o extrato"
                  : period < current
                    ? "no fim do mês, pelos lançamentos"
                    : period === current
                      ? "hoje, pelos lançamentos"
                      : "hoje (o futuro está na projeção)"
              }
            />
          </section>

          {overdue.length > 0 ? (
            <PanelCard
              id="financeiro-atrasado"
              title={
                <>
                  <span className="size-1.5 rounded-full bg-overdue" aria-hidden="true" />
                  <span className="whitespace-nowrap">Em atraso</span>
                  <PanelCount value={overdue.length} />
                </>
              }
              action={
                <span className="block text-right text-xs text-muted-foreground tabular-nums">
                  {overdueIncome.length > 0 ? <span className="whitespace-nowrap">a receber {formatMoney(sum(overdueIncome))}</span> : null}
                  {overdueIncome.length > 0 && overdueExpense.length > 0 ? " · " : null}
                  {overdueExpense.length > 0 ? <span className="whitespace-nowrap">a pagar {formatMoney(sum(overdueExpense))}</span> : null}
                </span>
              }
              className="mt-6 border-overdue/25"
            >
              <FinanceRows items={overdue} today={today} onOpen={openItem} showMonth />
            </PanelCard>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0 space-y-6">
              <PanelCard
                id="receitas"
                title={
                  <>
                    Receitas
                    <PanelCount value={income.length} />
                  </>
                }
                action={
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNew({ kind: "income" })}>
                    <Plus className="size-3.5" />
                    Receita
                  </Button>
                }
              >
                <FinanceRows items={income} today={today} onOpen={openItem} emptyText="Nenhuma receita com vencimento neste mês." />
              </PanelCard>
              <PanelCard
                id="despesas"
                title={
                  <>
                    Despesas
                    <PanelCount value={expense.length} />
                  </>
                }
                action={
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNew({ kind: "expense" })}>
                    <Plus className="size-3.5" />
                    Despesa
                  </Button>
                }
              >
                <FinanceRows items={expense} today={today} onOpen={openItem} emptyText="Nenhuma despesa com vencimento neste mês." />
              </PanelCard>
            </div>

            <aside className="min-w-0 space-y-6" aria-label="Resultado, divisão e alertas">
              <PanelCard
                id="resultado-do-mes"
                title={
                  <>
                    Resultado do mês
                    <StatusChip status={dre.status} />
                  </>
                }
                action={
                  <Link href="/financeiro/dre" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                    Ver DRE
                  </Link>
                }
              >
                <dl className="px-4 py-3">
                  <MoneyLine label="Receita bruta" value={formatMoney(dre.revenue)} strong href={ledgerHref({ mes: period, contas: DRE_LINE_ACCOUNTS.revenue })} />
                  <MoneyLine label={`(−) Imposto (${formatPercent(index.taxRate)})`} value={formatMoney(-dre.tax)} indent />
                  <MoneyLine label="(−) Taxas do gateway" value={formatMoney(-dre.fees)} indent />
                  <MoneyLine
                    label="(−) Custos diretos"
                    value={formatMoney(-dre.directCosts)}
                    indent
                    href={ledgerHref({ mes: period, contas: DRE_LINE_ACCOUNTS.directCosts })}
                  />
                  <MoneyLine label="(=) Margem de contribuição" value={formatMoney(dre.contribution)} strong tone={dre.contribution < 0 ? "negative" : undefined} />
                  <MoneyLine
                    label="(−) Custos fixos"
                    value={formatMoney(-dre.fixedCosts)}
                    indent
                    href={ledgerHref({ mes: period, contas: DRE_LINE_ACCOUNTS.fixedCosts })}
                  />
                  <MoneyLine
                    label="(−) Outras despesas"
                    value={formatMoney(-dre.otherExpenses)}
                    indent
                    href={ledgerHref({ mes: period, contas: DRE_LINE_ACCOUNTS.otherExpenses })}
                  />
                  <div className="mt-1 border-t pt-1">
                    <MoneyLine label="(=) Resultado" value={formatMoney(dre.result)} strong tone={dre.result < 0 ? "negative" : undefined} />
                  </div>
                  {dre.ownerContributions + dre.taxPaid + dre.ownerDraws + dre.reinvestments > 0 ? (
                    <div className="mt-2 border-t pt-2">
                      <p className="pb-1 text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">Fora do resultado</p>
                      {dre.ownerContributions > 0 ? (
                        <MoneyLine label="Aportes de sócios" value={formatMoney(dre.ownerContributions)} href={ledgerHref({ mes: period, contas: ["owner_contribution"] })} />
                      ) : null}
                      {dre.taxPaid > 0 ? <MoneyLine label="Imposto (DAS)" value={formatMoney(-dre.taxPaid)} href={ledgerHref({ mes: period, contas: ["tax"] })} /> : null}
                      {dre.ownerDraws > 0 ? (
                        <MoneyLine label="Pró-labore" value={formatMoney(-dre.ownerDraws)} href={ledgerHref({ mes: period, contas: ["owner_draw"] })} />
                      ) : null}
                      {dre.reinvestments > 0 ? (
                        <MoneyLine label="Reinvestimentos" value={formatMoney(-dre.reinvestments)} href={ledgerHref({ mes: period, contas: ["reinvestment"] })} />
                      ) : null}
                    </div>
                  ) : null}
                </dl>
              </PanelCard>

              {split ? (
                <PanelCard
                  id="divisao-do-resultado"
                  title="Divisão do resultado"
                  action={
                    <Link href="/financeiro/projecao" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                      Projeção
                    </Link>
                  }
                >
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">{RULE_LABEL[split.rule]}</p>
                    <dl className="mt-2">
                      <MoneyLine label="Para o caixa" value={formatMoney(split.toReserve - split.deficit)} tone={split.deficit > 0 ? "negative" : undefined} />
                      <MoneyLine label="Reinvestimento" value={formatMoney(split.toReinvest)} />
                      <MoneyLine
                        label={`Pró-labore (${data.settings.partners} ${data.settings.partners === 1 ? "sócio" : "sócios"})`}
                        value={split.toOwners > 0 ? `${formatMoney(split.perPartner)} cada` : formatMoney(0)}
                      />
                    </dl>
                    <div className="mt-3 border-t pt-3">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-muted-foreground">Caixa acumulado</span>
                        <span className={split.reserveEnd < 0 ? "font-medium text-overdue tabular-nums" : "font-medium text-foreground tabular-nums"}>
                          {formatMoney(split.reserveEnd)}
                        </span>
                      </div>
                      <Progress
                        value={split.reserveTarget > 0 ? Math.max(0, Math.min(100, (split.reserveEnd / split.reserveTarget) * 100)) : 100}
                        aria-label="Caixa acumulado em relação ao mínimo"
                        className="mt-2 h-1"
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                        mínimo de {formatMoney(split.reserveTarget)} ({data.settings.reserve_months} meses de custo fixo)
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                      MRR {formatMoneyShort(monthlyRecurring)}
                      {mrrChange !== 0 ? ` (${formatMoneyDelta(mrrChange)} no mês)` : ""}
                    </p>
                  </div>
                </PanelCard>
              ) : null}

              {period === current ? (
                <PanelCard
                  id="alertas"
                  title={
                    <>
                      Atenção
                      {alerts.length > 0 ? <PanelCount value={alerts.length} /> : null}
                    </>
                  }
                >
                  <AlertList alerts={alerts} empty="Nada pendente no financeiro." />
                </PanelCard>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
