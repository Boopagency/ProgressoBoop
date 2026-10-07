"use client"

import { Plus, Repeat } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { KpiTile } from "@/components/kpi-tile"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { periodLabel } from "@/features/clients/logic"
import { useFinanceDialog } from "@/features/finance/finance-shell"
import {
  clientMargins,
  fixedCostsMonthly,
  indexFinance,
  mrr,
  recurrenceSummary,
  type FinanceData,
  type RecurrenceSummary,
} from "@/features/finance/management"
import { formatMoney, formatMoneyShort } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import { FINANCE_ACCOUNT_LABEL, FINANCE_ACCOUNTS } from "@/lib/labels"
import type { DateKey, FinanceAccount } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Aba Contratos e custos: o que se repete todo mês, por cliente e por categoria. */
export function ContractsView({ data, today }: { data: FinanceData; today: DateKey }) {
  const { clientById } = useWorkspace()
  const { openRecurrence, openNew } = useFinanceDialog()
  const [showEnded, setShowEnded] = useState(false)
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const margins = clientMargins(index)
  const monthly = mrr(index, index.current)
  const clients = margins.filter((margin) => margin.mrr > 0).length
  const fixed = fixedCostsMonthly(index)
  const top = margins[0]
  const summaries = data.recurrences.map((recurrence) => recurrenceSummary(index, recurrence))
  const live = summaries.filter((summary) => summary.state !== "ended")
  const ended = summaries.filter((summary) => summary.state === "ended")
  const groups = FINANCE_ACCOUNTS.map((account) => ({
    account,
    items: live
      .filter((summary) => summary.recurrence.account === account)
      .sort((a, b) => b.recurrence.amount_cents - a.recurrence.amount_cents),
  })).filter((group) => group.items.length > 0)

  return (
    <div>
      <section aria-label="Resumo dos contratos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="MRR" value={formatMoney(monthly)} hint="contratos de clientes que valem neste mês" />
        <KpiTile
          label="Clientes com contrato"
          value={String(clients)}
          hint={clients > 0 ? `ticket médio de ${formatMoneyShort(Math.round(monthly / clients))} por mês` : "nenhum contrato ativo"}
        />
        <KpiTile
          label="Maior cliente"
          value={top && monthly > 0 ? formatPercent(top.mrr / monthly, true) : "—"}
          alert={Boolean(top && monthly > 0 && top.mrr / monthly >= 0.5)}
          hint={top && monthly > 0 ? `do MRR é de ${clientById.get(top.clientId)?.name ?? "um cliente"}` : "concentração da receita"}
        />
        <KpiTile label="Custos fixos por mês" value={formatMoney(fixed)} hint={`caixa mínimo: ${formatMoneyShort(fixed * data.settings.reserve_months)}`} />
      </section>

      <PanelCard
        id="margem-por-cliente"
        title={
          <>
            Margem por cliente
            <PanelCount value={margins.length} />
          </>
        }
        className="mt-6"
      >
        {margins.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">
            Nenhum contrato ativo. Lance a mensalidade do cliente como receita que se repete todo mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">MRR</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Imposto e taxa</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Custos diretos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Margem</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Fim do contrato</th>
                </tr>
              </thead>
              <tbody>
                {margins.map((margin) => {
                  const client = clientById.get(margin.clientId)
                  return (
                    <tr key={margin.clientId} className="border-t">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <Link href={`/clientes/${margin.clientId}`} className="font-medium text-foreground hover:underline">
                          {client?.name ?? "Cliente"}
                        </Link>
                        {margin.services.length > 0 ? <span className="block text-xs text-muted-foreground">{margin.services.join(" · ")}</span> : null}
                      </th>
                      <td className="px-3 py-2 text-right text-foreground">{formatMoney(margin.mrr)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{margin.deductions > 0 ? formatMoney(-margin.deductions) : "—"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{margin.directCosts > 0 ? formatMoney(-margin.directCosts) : "—"}</td>
                      <td className={cn("px-3 py-2 text-right font-medium", margin.margin < 0 ? "text-overdue" : "text-foreground")}>
                        {formatMoney(margin.margin)}
                        <span className="block text-[11px] font-normal text-muted-foreground">{formatPercent(margin.marginRate)}</span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {margin.contractEnd ? (
                          <>
                            <span className={margin.ending ? "font-medium text-warning-ink" : "text-foreground"}>
                              {formatShortDate(margin.contractEnd, today)}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {margin.daysToEnd !== null && margin.daysToEnd >= 0 ? `em ${margin.daysToEnd} dias` : "encerrado"}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">sem prazo</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Margem = MRR − imposto ({formatPercent(index.taxRate)}) − taxa do gateway ({formatPercent(index.gatewayRate)}) − custos diretos do
          cliente, como na aba CLIENTES da planilha.
        </p>
      </PanelCard>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Repeat className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Recorrências
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => openNew({ kind: "income" })}>
            <Plus className="size-3.5" />
            Contrato
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => openNew({ kind: "expense", account: "fixed_cost" })}>
            <Plus className="size-3.5" />
            Custo fixo
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        {groups.map((group) => (
          <RecurrenceGroup
            key={group.account}
            account={group.account}
            items={group.items}
            today={today}
            onOpen={(summary) => openRecurrence(summary.recurrence)}
            clientName={(id) => clientById.get(id)?.name}
          />
        ))}
        {groups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nenhuma recorrência ativa.</p>
        ) : null}
      </div>

      {ended.length > 0 ? (
        <div className="mt-6">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEnded((value) => !value)}>
            {showEnded ? "Esconder encerradas" : `Ver encerradas (${ended.length})`}
          </Button>
          {showEnded ? (
            <PanelCard id="recorrencias-encerradas" title="Encerradas" className="mt-3">
              <RecurrenceRows items={ended} today={today} onOpen={(summary) => openRecurrence(summary.recurrence)} clientName={(id) => clientById.get(id)?.name} />
            </PanelCard>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RecurrenceGroup({
  account,
  items,
  today,
  onOpen,
  clientName,
}: {
  account: FinanceAccount
  items: RecurrenceSummary[]
  today: DateKey
  onOpen: (summary: RecurrenceSummary) => void
  clientName: (id: string) => string | undefined
}) {
  const active = items.filter((summary) => summary.state === "active")
  const total = active.reduce((sum, summary) => sum + summary.recurrence.amount_cents, 0)
  return (
    <PanelCard
      id={`recorrencias-${account}`}
      title={
        <>
          {FINANCE_ACCOUNT_LABEL[account]}
          <PanelCount value={items.length} />
        </>
      }
      action={<span className="text-xs text-muted-foreground tabular-nums">{formatMoney(total)} por mês</span>}
    >
      <RecurrenceRows items={items} today={today} onOpen={onOpen} clientName={clientName} />
    </PanelCard>
  )
}

function RecurrenceRows({
  items,
  today,
  onOpen,
  clientName,
}: {
  items: RecurrenceSummary[]
  today: DateKey
  onOpen: (summary: RecurrenceSummary) => void
  clientName: (id: string) => string | undefined
}) {
  return (
    <ul className="divide-y">
      {items.map((summary) => {
        const { recurrence } = summary
        const client = recurrence.client_id ? clientName(recurrence.client_id) : undefined
        const when =
          summary.state === "future"
            ? `começa em ${periodLabel(recurrence.starts_on).toLocaleLowerCase("pt-BR")}`
            : summary.state === "ended"
              ? `encerrada em ${periodLabel(recurrence.ends_on!).toLocaleLowerCase("pt-BR")}`
              : summary.lastDue
                ? `até ${formatShortDate(summary.lastDue, today)} · ${summary.remaining} ${summary.remaining === 1 ? "parcela" : "parcelas"}`
                : "sem prazo"
        return (
          <li key={recurrence.id}>
            <button
              type="button"
              onClick={() => onOpen(summary)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">{recurrence.description}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[client, recurrence.category, `dia ${recurrence.day_of_month}`, when].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn("block text-[13px] tabular-nums", recurrence.kind === "income" ? "text-foreground" : "text-muted-foreground")}>
                  {recurrence.kind === "expense" ? "− " : ""}
                  {formatMoneyShort(recurrence.amount_cents)}
                </span>
                {summary.ending ? <span className="block text-[11px] font-medium text-warning-ink">termina em breve</span> : null}
                {summary.remainingTotal !== null && summary.state !== "ended" && !summary.ending ? (
                  <span className="block text-[11px] text-muted-foreground tabular-nums">restam {formatMoneyShort(summary.remainingTotal)}</span>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
