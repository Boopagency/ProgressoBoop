"use client"

import { Gavel, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { DecisionDialog, type DecisionDialogState } from "@/features/decisions/decision-dialog"
import { compareDecisions } from "@/features/decisions/logic"
import { formatShortDate, todayKey } from "@/lib/dates"
import type { DateKey, Decision } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Decisões de uma reunião, projeto ou cliente, com "Nova" já ligada à origem.
 * Revogadas aparecem riscadas, no fim.
 */
export function DecisionsCard({
  decisions,
  defaults,
  title = "Decisões",
  emptyText = "Nenhuma decisão registrada aqui.",
  limit = 6,
  className,
}: {
  decisions: Decision[]
  defaults: DecisionDialogState["defaults"]
  title?: string
  emptyText?: string
  limit?: number
  className?: string
}) {
  const [today] = useState<DateKey>(() => todayKey())
  const [dialog, setDialog] = useState<DecisionDialogState>({ open: false, key: 0 })
  const sorted = [...decisions].sort(
    (a, b) => Number(a.status === "revoked") - Number(b.status === "revoked") || compareDecisions(a, b)
  )
  const active = decisions.filter((decision) => decision.status === "active").length

  return (
    <PanelCard
      id={`decisoes-${title.toLowerCase().replace(/\W+/g, "-")}`}
      title={
        <>
          {title}
          <PanelCount value={active} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, defaults }))}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Nova
        </Button>
      }
      className={className}
    >
      {sorted.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="py-1">
          {sorted.slice(0, limit).map((decision) => (
            <li key={decision.id}>
              <button
                type="button"
                onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, decision }))}
                className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <Gavel
                  className={cn("mt-0.5 size-3.5 shrink-0", decision.status === "active" ? "text-brand-ink" : "text-subtle-foreground")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "line-clamp-2 text-[13px] leading-5 text-foreground",
                      decision.status === "revoked" && "text-muted-foreground line-through"
                    )}
                  >
                    {decision.title}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatShortDate(decision.decided_on, today)}
                    {decision.status === "revoked" ? " · revogada" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > limit ? (
        <Link href="/decisoes" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Ver todas as decisões
        </Link>
      ) : null}
      <DecisionDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PanelCard>
  )
}
