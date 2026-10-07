"use client"

import { ChevronLeft, ChevronRight, Plus, Repeat, Wallet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { periodLabel, periodOf, periodParam, addPeriods } from "@/features/clients/logic"
import { FinanceDialog, type FinanceDialogState } from "@/features/finance/finance-dialog"
import {
  monthHistory,
  monthItems,
  overdueItems,
  recurrenceActiveIn,
  resultOf,
  totalsOf,
  type FinanceItem,
} from "@/features/finance/logic"
import { FinanceRows } from "@/features/finance/finance-rows"
import { formatMoney, formatMoneyShort } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { formatMonthYear } from "@/lib/dates"
import type { DateKey, FinanceEntry, FinanceRecurrence } from "@/lib/types"
import { cn } from "@/lib/utils"

export function FinanceView({
  entries,
  recurrences,
  period,
  today,
}: {
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
  /** Mês aberto (dia 1). */
  period: DateKey
  today: DateKey
}) {
  const { clientById } = useWorkspace()
  const [dialog, setDialog] = useState<FinanceDialogState>({ open: false, key: 0 })
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))
  const current = periodOf(today)
  const items = monthItems(entries, recurrences, period)
  const income = items.filter((item) => item.kind === "income")
  const expense = items.filter((item) => item.kind === "expense")
  const totals = totalsOf(items)
  const result = resultOf(totals)
  const overdue = overdueItems(entries, recurrences, today)
  const overdueIncome = overdue.filter((item) => item.kind === "income")
  const overdueExpense = overdue.filter((item) => item.kind === "expense")
  const history = monthHistory(entries, recurrences, period, 6)
  const active = recurrences.filter((recurrence) => recurrenceActiveIn(recurrence, period) || recurrence.starts_on > period)
  const monthlyIncome = recurrences
    .filter((recurrence) => recurrence.kind === "income" && recurrenceActiveIn(recurrence, period))
    .reduce((sum, recurrence) => sum + recurrence.amount_cents, 0)
  const monthlyExpense = recurrences
    .filter((recurrence) => recurrence.kind === "expense" && recurrenceActiveIn(recurrence, period))
    .reduce((sum, recurrence) => sum + recurrence.amount_cents, 0)

  function open(item: FinanceItem) {
    setDialog((state) => ({ open: true, key: state.key + 1, item }))
  }

  const empty = entries.length === 0 && recurrences.length === 0

  return (
    <PageContainer className="max-w-[1160px]">
      <PageHeader
        title="Financeiro"
        description="Receitas e despesas da Boop, mês a mês"
        actions={
          <Button onClick={() => setDialog((state) => ({ open: true, key: state.key + 1 }))} className="gap-1.5">
            <Plus />
            Novo lançamento
          </Button>
        }
      />

      <nav aria-label="Mês" className="mt-6 flex items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
          <Link href={`?mes=${periodParam(addPeriods(period, -1))}`} scroll={false}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-44 text-center font-display text-base font-semibold text-foreground">{formatMonthYear(period)}</h2>
        <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
          <Link href={`?mes=${periodParam(addPeriods(period, 1))}`} scroll={false}>
            <ChevronRight />
          </Link>
        </Button>
        {period !== current ? (
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/financeiro" scroll={false}>
              Este mês
            </Link>
          </Button>
        ) : null}
      </nav>

      {empty ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Wallet className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-semibold">Comece pelos fees e pelas assinaturas</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cadastre cada fee mensal como receita que se repete todo mês e cada ferramenta como despesa. Depois é só
            marcar o que entrou e o que saiu: o resultado do mês e o que está em atraso aparecem aqui.
          </p>
          <Button size="sm" className="mt-5" onClick={() => setDialog((state) => ({ open: true, key: state.key + 1 }))}>
            Primeiro lançamento
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="Resumo do mês" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Recebido"
              value={formatMoney(totals.income.done)}
              hint={`de ${formatMoney(totals.income.expected)} previstos`}
              percent={totals.income.expected ? (totals.income.done / totals.income.expected) * 100 : 0}
            />
            <Tile
              label="Pago"
              value={formatMoney(totals.expense.done)}
              hint={`de ${formatMoney(totals.expense.expected)} previstos`}
              percent={totals.expense.expected ? (totals.expense.done / totals.expense.expected) * 100 : 0}
              muted
            />
            <Tile
              label="Resultado do mês"
              value={formatMoney(result.done)}
              tone={result.done < 0 ? "negative" : "default"}
              hint={`previsto: ${formatMoney(result.expected)}`}
            />
            <Tile
              label="Recorrente"
              value={formatMoneyShort(monthlyIncome)}
              hint={`por mês em fees · ${formatMoneyShort(monthlyExpense)} em despesas fixas`}
            />
          </section>

          {period === current && overdue.length > 0 ? (
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
                  {overdueIncome.length > 0 ? (
                    <span className="whitespace-nowrap">
                      a receber {formatMoney(overdueIncome.reduce((sum, item) => sum + item.amount_cents, 0))}
                    </span>
                  ) : null}
                  {overdueIncome.length > 0 && overdueExpense.length > 0 ? " · " : null}
                  {overdueExpense.length > 0 ? (
                    <span className="whitespace-nowrap">
                      a pagar {formatMoney(overdueExpense.reduce((sum, item) => sum + item.amount_cents, 0))}
                    </span>
                  ) : null}
                </span>
              }
              className="mt-6 border-overdue/25"
            >
              <FinanceRows items={overdue} today={today} onOpen={open} showMonth />
            </PanelCard>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setDialog((state) => ({ open: true, key: state.key + 1, defaults: { kind: "income" } }))}
                  >
                    <Plus className="size-3.5" />
                    Receita
                  </Button>
                }
              >
                <FinanceRows items={income} today={today} onOpen={open} emptyText="Nenhuma receita com vencimento neste mês." />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setDialog((state) => ({ open: true, key: state.key + 1, defaults: { kind: "expense" } }))}
                  >
                    <Plus className="size-3.5" />
                    Despesa
                  </Button>
                }
              >
                <FinanceRows items={expense} today={today} onOpen={open} emptyText="Nenhuma despesa com vencimento neste mês." />
              </PanelCard>
            </div>

            <aside className="min-w-0 space-y-6" aria-label="Histórico e recorrências">
              <PanelCard id="ultimos-meses" title="Últimos 6 meses">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2 font-medium">Mês</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Entrou</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Saiu</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((month) => {
                      const { income, expense } = month.totals
                      const net = income.done - expense.done
                      const empty = income.done === 0 && expense.done === 0
                      return (
                        <tr key={month.period} className={cn("border-t", month.period === period && "bg-accent/50")}>
                          <td className="px-4 py-2">
                            <Link href={`?mes=${periodParam(month.period)}`} scroll={false} className="hover:underline first-letter:uppercase">
                              {periodLabel(month.period).split(" de ")[0]}
                            </Link>
                          </td>
                          {empty ? (
                            <td colSpan={3} className="px-4 py-2 text-right text-subtle-foreground">
                              —
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-2 text-right text-foreground">{formatMoneyShort(income.done)}</td>
                              <td className="px-2 py-2 text-right text-muted-foreground">{formatMoneyShort(expense.done)}</td>
                              <td className={cn("px-4 py-2 text-right font-medium", net < 0 ? "text-overdue" : "text-foreground")}>
                                {formatMoneyShort(net)}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </PanelCard>

              <PanelCard
                id="recorrencias"
                title={
                  <>
                    <Repeat className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    Todo mês
                    <PanelCount value={active.length} />
                  </>
                }
              >
                {active.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-muted-foreground">
                    Nenhuma recorrência. Marque “Repetir todo mês” ao lançar um fee ou uma assinatura.
                  </p>
                ) : (
                  <ul className="py-1">
                    {[...active]
                      .sort((a, b) => (a.kind === b.kind ? b.amount_cents - a.amount_cents : a.kind === "income" ? -1 : 1))
                      .map((recurrence) => (
                        <li key={recurrence.id}>
                          <button
                            type="button"
                            onClick={() => setDialog((state) => ({ open: true, key: state.key + 1, recurrence }))}
                            className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">{recurrence.description}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                dia {recurrence.day_of_month}
                                {recurrence.client_id ? ` · ${clientById.get(recurrence.client_id)?.name ?? ""}` : ""}
                                {recurrence.ends_on ? ` · até ${periodLabel(recurrence.ends_on).toLocaleLowerCase("pt-BR")}` : ""}
                                {recurrence.starts_on > period ? ` · começa em ${periodLabel(recurrence.starts_on).toLocaleLowerCase("pt-BR")}` : ""}
                              </span>
                            </span>
                            <span className={cn("shrink-0 text-[13px] tabular-nums", recurrence.kind === "income" ? "text-foreground" : "text-muted-foreground")}>
                              {recurrence.kind === "expense" ? "− " : ""}
                              {formatMoneyShort(recurrence.amount_cents)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </PanelCard>
            </aside>
          </div>
        </>
      )}

      <FinanceDialog state={dialog} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} />
    </PageContainer>
  )
}

function Tile({
  label,
  value,
  hint,
  percent,
  tone = "default",
  muted = false,
}: {
  label: string
  value: string
  hint: string
  percent?: number
  tone?: "default" | "negative"
  muted?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg leading-6 font-semibold tracking-tight tabular-nums sm:text-[22px] sm:leading-7",
          tone === "negative" ? "text-overdue" : "text-foreground"
        )}
      >
        {value}
      </p>
      {percent !== undefined ? (
        <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", muted ? "bg-muted-foreground/40" : "bg-brand")}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{hint}</p>
    </div>
  )
}
