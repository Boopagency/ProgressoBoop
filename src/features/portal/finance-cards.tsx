import { CircleAlert, CircleCheck } from "lucide-react"
import Link from "next/link"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { dueLabel, overdueNoticeText, type FinanceItem } from "@/features/finance/logic"
import { formatMoney } from "@/features/finance/money"
import { formatShortDate } from "@/lib/dates"
import { PORTAL_FINANCE_STATUS_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Financeiro do cliente no portal: o selo (em dia ou com pagamento em aberto),
 * o aviso gentil sobre o atraso e as listas. Server Components.
 */

/**
 * Aviso do atraso, no Início e na aba Financeiro: educado, com a saída para
 * quem já pagou (a baixa é manual e pode demorar).
 */
export function OverdueNotice({ overdue, communicationHref }: { overdue: FinanceItem[]; communicationHref: string }) {
  const text = overdueNoticeText(overdue)
  if (!text) return null
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-attention-line/15 bg-attention-soft px-4 py-3.5">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-attention-line" aria-hidden="true" />
      <p className="text-[13px] leading-5 text-attention-ink">
        {text} Se já pagou, desconsidere ou{" "}
        <Link href={communicationHref} className="font-medium underline underline-offset-2 hover:text-attention-ink-strong">
          avise a gente pela Comunicação
        </Link>
        .
      </p>
    </div>
  )
}

/** Selo do topo da aba: em dia, ou quanto está em aberto. */
export function FinanceStatus({ overdue, total }: { overdue: number; total: number }) {
  const late = overdue > 0
  const Icon = late ? CircleAlert : CircleCheck
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-card px-4 py-4", late && "border-attention-line/25")}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          late ? "bg-attention-muted text-attention-ink" : "bg-success/15 text-success-ink"
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={cn("text-[15px] font-semibold", late ? "text-attention-ink" : "text-success-ink")}>
          {late ? PORTAL_FINANCE_STATUS_LABEL.overdue : PORTAL_FINANCE_STATUS_LABEL.ok}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {late
            ? `${overdue === 1 ? "1 cobrança vencida" : `${overdue} cobranças vencidas`}, ${formatMoney(total)} no total.`
            : "Nenhum pagamento vencido."}
        </p>
      </div>
    </div>
  )
}

type Variant = "overdue" | "upcoming" | "paid"

function itemNote(item: FinanceItem, variant: Variant, today: DateKey): string {
  if (variant === "paid") return `Pago em ${formatShortDate(item.paid_on!, today)} · vencimento ${formatShortDate(item.due_on, today)}`
  const due = dueLabel(item.due_on, today)
  return variant === "overdue" ? `${due.label} · vencimento ${formatShortDate(item.due_on, today)}` : due.label
}

/** Uma lista do financeiro (em aberto, próximos ou pagos). */
export function FinanceList({
  id,
  title,
  items,
  variant,
  today,
  empty,
}: {
  id: string
  title: string
  items: FinanceItem[]
  variant: Variant
  today: DateKey
  empty: string
}) {
  return (
    <PanelCard id={id} title={<>{title} {items.length > 0 ? <PanelCount value={items.length} /> : null}</>}>
      {items.length === 0 ? (
        <p className="px-5 py-5 text-[13px] leading-5 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.key} className="flex items-baseline gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.description}</p>
                <p className={cn("mt-0.5 text-xs", variant === "overdue" ? "font-medium text-overdue" : "text-muted-foreground")}>
                  {itemNote(item, variant, today)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium text-foreground tabular-nums">{formatMoney(item.amount_cents)}</p>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
