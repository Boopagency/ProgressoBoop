"use client"

import { AlertTriangle, Handshake } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { isOpenDeal } from "@/features/deals/logic"
import { financeAlerts, indexFinance, type FinanceData } from "@/features/finance/management"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { addDaysToKey, formatShortDate } from "@/lib/dates"
import type { DateKey, Deal } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Tela Hoje: o que a gestão pede agora — fechar o mês, contratos acabando,
 * queda do MRR, caixa negativo na projeção e negócios para dar retorno.
 */
export function ManagementCard({ finance, deals, today, className }: { finance: FinanceData; deals: Deal[]; today: DateKey; className?: string }) {
  const { clientById } = useWorkspace()
  const alerts = useMemo(
    () => financeAlerts(indexFinance(finance, today), (id) => clientById.get(id)?.name ?? "cliente").filter((alert) => alert.tone === "attention"),
    [finance, today, clientById]
  )
  const soon = addDaysToKey(today, 3)
  const followUps = deals
    .filter((deal) => isOpenDeal(deal) && deal.expected_close_on !== null && deal.expected_close_on <= soon)
    .sort((a, b) => (a.expected_close_on ?? "").localeCompare(b.expected_close_on ?? ""))
    .slice(0, 4)
  if (alerts.length === 0 && followUps.length === 0) return null

  return (
    <section aria-labelledby="gestao-hoje" className={cn("rounded-xl border bg-card", className)}>
      <header className="px-4 pt-3.5 pb-1">
        <h2 id="gestao-hoje" className="text-sm font-semibold text-foreground">
          Gestão
        </h2>
      </header>
      <ul className="pb-1">
        {alerts.slice(0, 4).map((alert) => (
          <li key={alert.key}>
            <Link href={alert.href} className="flex gap-2.5 px-4 py-2 transition-colors hover:bg-muted/40">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] text-foreground">{alert.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{alert.detail}</span>
              </span>
            </Link>
          </li>
        ))}
        {followUps.map((deal) => {
          const late = deal.expected_close_on! < today
          return (
            <li key={deal.id}>
              <Link href={`/comercial?negocio=${deal.id}`} className="flex gap-2.5 px-4 py-2 transition-colors hover:bg-muted/40">
                <Handshake className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-foreground">{deal.title}</span>
                  <span className={cn("block text-xs", late ? "font-medium text-overdue" : "text-muted-foreground")}>
                    {late ? `Previsão de fechamento passou (${formatShortDate(deal.expected_close_on!, today)})` : `Fecha ${formatShortDate(deal.expected_close_on!, today)}`}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
