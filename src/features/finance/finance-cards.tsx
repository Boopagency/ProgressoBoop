"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { FinanceDialog, type FinanceDialogState } from "@/features/finance/finance-dialog"
import { clientFinance, clientOverdue, overdueItems, projectItems, totalsOf, type FinanceItem } from "@/features/finance/logic"
import { FinanceRows } from "@/features/finance/finance-rows"
import { formatMoney } from "@/features/finance/money"
import type { DateKey, FinanceEntry, FinanceRecurrence, Project } from "@/lib/types"
import { cn } from "@/lib/utils"

function useFinanceDialog() {
  const [dialog, setDialog] = useState<FinanceDialogState>({ open: false, key: 0 })
  return {
    dialog,
    openNew: (defaults: FinanceDialogState["defaults"]) =>
      setDialog((current) => ({ open: true, key: current.key + 1, defaults })),
    openItem: (item: FinanceItem) => setDialog((current) => ({ open: true, key: current.key + 1, item })),
    element: (
      <FinanceDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    ),
  }
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "late" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "late" ? "font-medium text-overdue" : tone === "muted" ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** Página do cliente: fee mensal, o que está em atraso e o que já entrou no ano. */
export function ClientFinanceCard({
  clientId,
  entries,
  recurrences,
  today,
}: {
  clientId: string
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
  today: DateKey
}) {
  const summary = clientFinance(clientId, entries, recurrences, today)
  const overdue = clientOverdue(clientId, entries, recurrences, today)
  const { openNew, openItem, element } = useFinanceDialog()

  return (
    <PanelCard
      id="financeiro-cliente"
      title="Financeiro"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openNew({ kind: "income", client_id: clientId })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Lançar
        </Button>
      }
    >
      <dl className="space-y-2 px-4 py-3.5">
        <Line label="Fee mensal" value={summary.monthlyIncome > 0 ? formatMoney(summary.monthlyIncome) : "—"} tone={summary.monthlyIncome > 0 ? undefined : "muted"} />
        <Line
          label="Em atraso"
          value={summary.overdue.count > 0 ? `${formatMoney(summary.overdue.amount)} (${summary.overdue.count})` : "Nada"}
          tone={summary.overdue.count > 0 ? "late" : "muted"}
        />
        <Line label={`Recebido em ${today.slice(0, 4)}`} value={formatMoney(summary.receivedThisYear)} />
      </dl>
      {overdue.length > 0 ? (
        <FinanceRows items={overdue} today={today} onOpen={openItem} showMonth hide={["client"]} className="border-t" />
      ) : null}
      <Link href="/financeiro" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        Abrir o financeiro
      </Link>
      {element}
    </PanelCard>
  )
}

/** Página do projeto: receitas e custos ligados a ele, e o resultado. */
export function ProjectFinanceCard({
  project,
  entries,
  recurrences,
  today,
}: {
  project: Project
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
  today: DateKey
}) {
  const items = projectItems(project.id, entries, recurrences, today, project.due_on)
  const totals = totalsOf(items)
  const { openNew, openItem, element } = useFinanceDialog()

  return (
    <PanelCard
      id="financeiro-projeto"
      title="Financeiro"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openNew({ kind: "income", client_id: project.client_id, project_id: project.id })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Lançar
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Lance aqui o valor do projeto (entrada, parcelas) e os custos dele (freelancer, ferramentas) para ver o
          resultado.
        </p>
      ) : (
        <>
          <dl className="space-y-2 px-4 py-3.5">
            <Line label="Receita" value={`${formatMoney(totals.income.done)} de ${formatMoney(totals.income.expected)}`} />
            <Line label="Custos" value={`${formatMoney(totals.expense.done)} de ${formatMoney(totals.expense.expected)}`} tone="muted" />
            <Line
              label="Resultado previsto"
              value={formatMoney(totals.income.expected - totals.expense.expected)}
              tone={totals.income.expected - totals.expense.expected < 0 ? "late" : undefined}
            />
          </dl>
          <FinanceRows
            items={items.slice(0, 8)}
            today={today}
            onOpen={openItem}
            showMonth
            hide={["client", "project"]}
            className="border-t"
          />
        </>
      )}
      {element}
    </PanelCard>
  )
}

/** Tela Hoje: aviso discreto quando há recebimentos ou pagamentos vencidos. */
export function FinanceAlertCard({
  entries,
  recurrences,
  today,
  className,
}: {
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
  today: DateKey
  className?: string
}) {
  const overdue = overdueItems(entries, recurrences, today)
  if (overdue.length === 0) return null
  const income = overdue.filter((item) => item.kind === "income")
  const expense = overdue.filter((item) => item.kind === "expense")
  const sum = (list: FinanceItem[]) => list.reduce((total, item) => total + item.amount_cents, 0)

  return (
    <section aria-labelledby="financeiro-hoje" className={cn("rounded-xl border border-overdue/25 bg-card", className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
        <h2 id="financeiro-hoje" className="text-sm font-semibold text-foreground">
          Financeiro em atraso
        </h2>
      </header>
      <dl className="space-y-1.5 px-4 pb-2">
        {income.length > 0 ? (
          <Line label={`A receber (${income.length})`} value={formatMoney(sum(income))} tone="late" />
        ) : null}
        {expense.length > 0 ? <Line label={`A pagar (${expense.length})`} value={formatMoney(sum(expense))} /> : null}
      </dl>
      <Link href="/financeiro" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        Ver no financeiro
      </Link>
    </section>
  )
}
