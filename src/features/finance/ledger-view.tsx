"use client"

import { AlertTriangle, ChevronDown, Download, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addPeriods, periodLabel } from "@/features/clients/logic"
import { useFinanceDialog } from "@/features/finance/finance-shell"
import { MonthNav } from "@/features/finance/finance-ui"
import {
  filterLedger,
  LEDGER_STATUS_LABEL,
  ledgerSearch,
  ledgerStatusOf,
  ledgerTotals,
  type LedgerFilters,
  type LedgerStatus,
} from "@/features/finance/ledger-filters"
import type { FinanceItem } from "@/features/finance/logic"
import { entryIssues, indexFinance, ledgerItems, periodsOf, type FinanceData } from "@/features/finance/management"
import { formatMoney } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, monthRangeOf } from "@/lib/dates"
import { EXPENSE_ACCOUNTS, FINANCE_ACCOUNT_LABEL, INCOME_ACCOUNTS } from "@/lib/labels"
import type { DateKey, FinanceAccount } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"

const STATUS_TEXT: Record<LedgerStatus, string> = {
  paid: "Pago",
  open: "A vencer",
  overdue: "Vencido",
  skipped: "Pulado",
}

/** Aba Lançamentos: o extrato filtrável, com a origem de cada número. */
export function LedgerView({ data, today, filters }: { data: FinanceData; today: DateKey; filters: LedgerFilters }) {
  const router = useRouter()
  const { clients, clientById, projectById } = useWorkspace()
  const { openItem } = useFinanceDialog()
  const [query, setQuery] = useState("")
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const periods = periodsOf({ start: filters.from, end: monthRangeOf(filters.to).end })
  const all = ledgerItems(index, periods)
  const names = (item: FinanceItem) =>
    [item.client_id ? clientById.get(item.client_id)?.name : null, item.project_id ? projectById.get(item.project_id)?.name : null]
      .filter(Boolean)
      .join(" · ")
  const items = filterLedger(all, filters, today, query, names)
  const totals = ledgerTotals(items)
  const single = filters.from === filters.to
  const filtered = filters.accounts.length > 0 || filters.clientId || filters.status || filters.kind || filters.issues
  const exportHref = `/api/relatorios/excel?secoes=lancamentos&${ledgerSearch(filters)}`

  function go(next: Partial<LedgerFilters>) {
    router.push(`/financeiro/lancamentos?${ledgerSearch({ ...filters, ...next })}`, { scroll: false })
  }

  function toggleAccount(account: FinanceAccount) {
    const accounts = filters.accounts.includes(account)
      ? filters.accounts.filter((candidate) => candidate !== account)
      : [...filters.accounts, account]
    go({ accounts })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {single ? (
          <MonthNav
            period={filters.from}
            current={index.current}
            basePath="/financeiro/lancamentos"
            hrefFor={(period) => `/financeiro/lancamentos?${ledgerSearch({ ...filters, from: period, to: period })}`}
          />
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">
              {periodLabel(filters.from)} a {periodLabel(filters.to).toLocaleLowerCase("pt-BR")}
            </h2>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => go({ from: index.current, to: index.current })}>
              Só este mês
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={single ? "1" : String(periods.length)}
            onValueChange={(value) => {
              const months = Number(value)
              go({ from: addPeriods(filters.to, -(months - 1)), to: filters.to })
            }}
          >
            <SelectTrigger size="sm" aria-label="Período" className="h-8 w-auto shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="1">1 mês</SelectItem>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
              {![1, 3, 6, 12].includes(periods.length) ? <SelectItem value={String(periods.length)}>{periods.length} meses</SelectItem> : null}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5">
            <a href={exportHref}>
              <Download className="size-3.5" />
              Excel
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descrição, cliente…" aria-label="Buscar" className="h-8 pl-8 text-[13px]" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1 font-normal shadow-none", filters.accounts.length > 0 && "border-brand/60")}>
              {filters.accounts.length === 0
                ? "Categoria"
                : filters.accounts.length === 1
                  ? FINANCE_ACCOUNT_LABEL[filters.accounts[0]!]
                  : `${filters.accounts.length} categorias`}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Entradas</DropdownMenuLabel>
            {INCOME_ACCOUNTS.map((account) => (
              <DropdownMenuCheckboxItem
                key={account}
                checked={filters.accounts.includes(account)}
                onCheckedChange={() => toggleAccount(account)}
                onSelect={(event) => event.preventDefault()}
              >
                {FINANCE_ACCOUNT_LABEL[account]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Saídas</DropdownMenuLabel>
            {EXPENSE_ACCOUNTS.map((account) => (
              <DropdownMenuCheckboxItem
                key={account}
                checked={filters.accounts.includes(account)}
                onCheckedChange={() => toggleAccount(account)}
                onSelect={(event) => event.preventDefault()}
              >
                {FINANCE_ACCOUNT_LABEL[account]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Select value={filters.clientId ?? ALL} onValueChange={(value) => go({ clientId: value === ALL ? null : value })}>
          <SelectTrigger size="sm" aria-label="Cliente" className={cn("h-8 w-auto shadow-none", filters.clientId && "border-brand/60")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Todos os clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status ?? ALL} onValueChange={(value) => go({ status: value === ALL ? null : (value as LedgerStatus) })}>
          <SelectTrigger size="sm" aria-label="Situação" className={cn("h-8 w-auto shadow-none", filters.status && "border-brand/60")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Qualquer situação</SelectItem>
            {(Object.keys(LEDGER_STATUS_LABEL) as LedgerStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {LEDGER_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filters.issues ? (
          <Button variant="outline" size="sm" className="h-8 gap-1 border-brand/60 shadow-none" onClick={() => go({ issues: false })}>
            Com pendência
            <X className="size-3.5" />
          </Button>
        ) : null}
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => go({ accounts: [], clientId: null, status: null, kind: null, issues: false })}
          >
            Limpar filtros
          </Button>
        ) : null}
      </div>

      <section aria-label="Totais" className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border text-[13px] sm:grid-cols-4">
        <Total label="Entrou (bruto)" value={formatMoney(totals.paidIn)} />
        <Total label="Saiu" value={formatMoney(-totals.paidOut)} />
        <Total label="Taxas" value={formatMoney(-totals.fees)} />
        <Total label="Líquido" value={formatMoney(totals.net)} strong negative={totals.net < 0} />
      </section>
      {totals.openIn + totals.openOut > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          Em aberto no período: a receber {formatMoney(totals.openIn)} · a pagar {formatMoney(totals.openOut)}
        </p>
      ) : null}

      <PanelCard
        id="extrato"
        title={
          <>
            Lançamentos
            <PanelCount value={items.length} />
          </>
        }
        className="mt-4"
      >
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nada com esses filtros no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Data</th>
                  <th scope="col" className="px-3 py-2 font-medium">Descrição</th>
                  <th scope="col" className="px-3 py-2 font-medium">Categoria</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Taxa</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = ledgerStatusOf(item, today)
                  const sign = item.kind === "income" ? 1 : -1
                  const issues = item.entry ? entryIssues(item.entry) : []
                  const meta = names(item)
                  return (
                    <tr
                      key={`${item.key}-${item.paid_on ?? "aberto"}`}
                      onClick={() => openItem(item)}
                      className={cn("cursor-pointer border-t transition-colors hover:bg-muted/40", status === "skipped" && "opacity-60")}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatShortDate(item.paid_on ?? item.due_on, today)}
                        {!item.paid_on ? <span className="block text-[11px] text-muted-foreground">vencimento</span> : null}
                      </td>
                      <td className="max-w-[320px] px-3 py-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openItem(item)
                          }}
                          className="block max-w-full truncate text-left font-medium text-foreground outline-none focus-visible:underline"
                        >
                          {item.description}
                        </button>
                        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block whitespace-nowrap text-foreground/90">{FINANCE_ACCOUNT_LABEL[item.account]}</span>
                        {item.category ? <span className="block truncate text-xs text-muted-foreground">{item.category}</span> : null}
                      </td>
                      <td className={cn("px-3 py-2 text-right whitespace-nowrap", sign < 0 ? "text-muted-foreground" : "text-foreground", status === "skipped" && "line-through")}>
                        {formatMoney(sign * item.amount_cents)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{item.fee_cents > 0 ? formatMoney(-item.fee_cents) : "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-foreground">
                        {item.paid_on ? formatMoney(sign * item.amount_cents - item.fee_cents) : "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={cn("text-xs", status === "overdue" ? "font-medium text-overdue" : "text-muted-foreground")}>
                          {status === "paid" ? (item.kind === "income" ? "Recebido" : "Pago") : STATUS_TEXT[status]}
                        </span>
                        {issues.length > 0 ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-warning-ink" title={issues.join(" · ")}>
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            {issues[0]}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Mesmo critério do DRE: cada lançamento aparece no mês em que foi pago; o que está em aberto, no mês do
          vencimento.
        </p>
      </PanelCard>
    </div>
  )
}

function Total({ label, value, strong = false, negative = false }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 tabular-nums", strong ? "font-semibold" : "font-medium", negative ? "text-overdue" : "text-foreground")}>{value}</p>
    </div>
  )
}
