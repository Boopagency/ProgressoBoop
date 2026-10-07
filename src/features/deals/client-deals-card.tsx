"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { DealDialog, type DealDialogState } from "@/features/deals/deal-dialog"
import { contractValue, isOpenDeal, probabilityOf } from "@/features/deals/logic"
import { WinDialog } from "@/features/deals/win-dialog"
import { formatMoneyShort } from "@/features/finance/money"
import { formatShortDate } from "@/lib/dates"
import { DEAL_STAGE_LABEL } from "@/lib/labels"
import type { DateKey, Deal } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Página do cliente: negócios dele (o que o trouxe e os de upsell) e um atalho para abrir outro. */
export function ClientDealsCard({ clientId, deals, today }: { clientId: string; deals: Deal[]; today: DateKey }) {
  const [dialog, setDialog] = useState<DealDialogState>({ open: false, key: 0 })
  const [winning, setWinning] = useState<Deal | null>(null)
  const own = deals
    .filter((deal) => deal.client_id === clientId)
    .sort((a, b) => Number(isOpenDeal(b)) - Number(isOpenDeal(a)) || b.updated_at.localeCompare(a.updated_at))
  const open = own.filter(isOpenDeal)

  return (
    <PanelCard
      id="negocios-cliente"
      title={
        <>
          Negócios
          <PanelCount value={own.length} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog((state) => ({ open: true, key: state.key + 1, defaults: { client_id: clientId } }))}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Negócio
        </Button>
      }
    >
      {own.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Upsell, renovação ou projeto novo: registre como negócio para entrar no funil.</p>
      ) : (
        <ul className="divide-y">
          {own.slice(0, 6).map((deal) => (
            <li key={deal.id}>
              <button
                type="button"
                onClick={() => setDialog((state) => ({ open: true, key: state.key + 1, deal }))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{deal.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {DEAL_STAGE_LABEL[deal.stage]}
                    {isOpenDeal(deal) ? ` · ${probabilityOf(deal)}%` : deal.closed_on ? ` · ${formatShortDate(deal.closed_on, today)}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 text-[13px] tabular-nums", deal.stage === "lost" ? "text-muted-foreground line-through" : "text-foreground")}>
                  {deal.recurring_cents > 0 ? `${formatMoneyShort(deal.recurring_cents)}/mês` : formatMoneyShort(contractValue(deal))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 || own.length > 6 ? (
        <Link href="/comercial" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Abrir o comercial
        </Link>
      ) : null}
      <DealDialog state={dialog} onOpenChange={(value) => setDialog((state) => ({ ...state, open: value }))} onWin={setWinning} />
      <WinDialog deal={winning} onOpenChange={(value) => !value && setWinning(null)} />
    </PanelCard>
  )
}
