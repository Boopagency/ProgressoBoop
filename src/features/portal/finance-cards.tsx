import { CircleAlert, CircleCheck } from "lucide-react"
import Link from "next/link"

import { HeroPanel } from "@/components/hero-panel"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { StatGrid } from "@/components/stat-grid"
import { dueLabel, overdueNoticeText, type FinanceItem } from "@/features/finance/logic"
import { formatMoney } from "@/features/finance/money"
import { formatShortDate } from "@/lib/dates"
import { PORTAL_FINANCE_STATUS_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Financeiro do cliente no portal: o selo (em dia ou com pagamento em aberto)
 * com os totais, o aviso gentil sobre o atraso e as listas. Server Components.
 */

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const

/**
 * Aviso do atraso, no Início e na aba Financeiro: educado, com a saída para
 * quem já pagou (a baixa é manual e pode demorar).
 */
export function OverdueNotice({ overdue, communicationHref }: { overdue: FinanceItem[]; communicationHref: string }) {
  const text = overdueNoticeText(overdue)
  if (!text) return null
  return (
    <div role="status" className="flex items-start gap-3.5 rounded-2xl border border-attention-line/25 bg-attention-soft px-4 py-4 sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-attention-muted text-attention-line">
        <CircleAlert className="size-4" aria-hidden="true" />
      </span>
      <p className="pt-1 text-[13.5px] leading-5 text-attention-ink">
        {text} Se já pagou, desconsidere ou{" "}
        <Link href={communicationHref} className="font-medium underline underline-offset-2 hover:text-attention-ink-strong">
          avise a gente pela Comunicação
        </Link>
        .
      </p>
    </div>
  )
}

const sum = (items: FinanceItem[]) => items.reduce((total, item) => total + item.amount_cents, 0)

/**
 * O selo do topo da aba, no painel de destaque: em dia, ou quanto está em
 * aberto (quantas cobranças e o total); e os totais de cada lista, que levam
 * a ela.
 */
export function FinanceStatus({
  overdue,
  upcoming,
  paid,
}: {
  overdue: FinanceItem[]
  upcoming: FinanceItem[]
  paid: FinanceItem[]
}) {
  const late = overdue.length > 0
  const Icon = late ? CircleAlert : CircleCheck
  const total = sum(overdue)
  const numbers = [
    ...(late ? [{ label: "Em aberto", cents: total, href: "#financeiro-aberto", alert: true }] : []),
    { label: "Próximos 60 dias", cents: sum(upcoming), href: "#financeiro-proximos", alert: false },
    { label: "Pagos em 12 meses", cents: sum(paid), href: "#financeiro-pagos", alert: false },
  ]

  return (
    <HeroPanel aria-label="Situação dos pagamentos" light="none">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-28 -right-20 -z-10 size-80 rounded-full blur-3xl",
          late ? "bg-attention-line/20" : "bg-glow/25"
        )}
      />
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            late
              ? "bg-attention-muted text-attention-line shadow-[0_0_24px_-4px_var(--attention-line)]"
              : "bg-success/15 text-success-ink shadow-[0_0_24px_-6px_var(--success)]"
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={cn("font-display text-[22px] leading-tight font-medium tracking-tight", late ? "text-attention-ink" : "text-success-ink")}>
            {late ? PORTAL_FINANCE_STATUS_LABEL.overdue : PORTAL_FINANCE_STATUS_LABEL.ok}
          </p>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {late
              ? `${overdue.length === 1 ? "1 cobrança vencida" : `${overdue.length} cobranças vencidas`}, ${formatMoney(total)} no total.`
              : "Nenhum pagamento vencido."}
          </p>
        </div>
      </div>

      <StatGrid
        variant="line"
        className="mt-6 sm:mt-8"
        items={numbers.map((item) => ({ label: item.label, value: formatMoney(item.cents), href: item.href, alert: item.alert }))}
      />
    </HeroPanel>
  )
}

type Variant = "overdue" | "upcoming" | "paid"

function itemNote(item: FinanceItem, variant: Variant, today: DateKey): string {
  if (variant === "paid") return `Pago em ${formatShortDate(item.paid_on!, today)} · vencimento ${formatShortDate(item.due_on, today)}`
  const due = dueLabel(item.due_on, today)
  return variant === "overdue" ? `${due.label} · vencimento ${formatShortDate(item.due_on, today)}` : due.label
}

/** Uma lista do financeiro (em aberto, próximos ou pagos), com a data em destaque à esquerda. */
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
    <PanelCard
      id={id}
      className="scroll-mt-6 rounded-[1.75rem]"
      title={<>{title} {items.length > 0 ? <PanelCount value={items.length} /> : null}</>}
    >
      {items.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] leading-5 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((item) => {
            const day = variant === "paid" && item.paid_on ? item.paid_on : item.due_on
            return (
              <li key={item.key} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex w-11 shrink-0 flex-col items-center rounded-xl border py-1.5",
                    variant === "overdue" ? "border-overdue/30 bg-overdue/8 text-overdue" : "bg-muted/60 text-foreground"
                  )}
                >
                  <span className="display-number text-[22px] leading-none">{day.slice(8, 10)}</span>
                  <span className="mt-0.5 text-[10px] tracking-wider uppercase opacity-75">{MONTHS[Number(day.slice(5, 7)) - 1]}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words text-foreground sm:truncate">{item.description}</p>
                  <p className={cn("mt-0.5 text-xs", variant === "overdue" ? "font-medium text-overdue" : "text-muted-foreground")}>
                    {itemNote(item, variant, today)}
                  </p>
                </div>
                <p className="shrink-0 text-[15px] font-semibold text-foreground tabular-nums">{formatMoney(item.amount_cents)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}
