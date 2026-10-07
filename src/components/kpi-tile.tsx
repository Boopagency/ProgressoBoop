import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Sparkline } from "@/components/charts/sparkline"
import { cn } from "@/lib/utils"

export interface KpiDelta {
  /** "+12%", "−R$ 700", "+3,1 p.p." */
  text: string
  direction: "up" | "down" | "flat"
  /** Subir é bom (true), ruim (false) ou neutro (null). */
  upIsGood: boolean | null
  /** "vs setembro", "vs 3º tri de 2026" */
  comparedTo: string
}

/**
 * Indicador: nome, valor, variação contra o período de comparação (seta +
 * cor só quando há direção boa/ruim), tendência e linha de apoio. Com `href`,
 * o cartão leva aos dados que formam o número.
 */
export function KpiTile({
  label,
  value,
  delta,
  hint,
  trend,
  href,
  onSelect,
  alert = false,
  footer,
  className,
}: {
  label: string
  value: ReactNode
  delta?: KpiDelta | null
  hint?: ReactNode
  trend?: (number | null)[]
  href?: string
  /** Abre o detalhe do número (no lugar do link). */
  onSelect?: () => void
  /** Número que pede atenção (vermelho). */
  alert?: boolean
  footer?: ReactNode
  className?: string
}) {
  const good =
    !delta || delta.direction === "flat" || delta.upIsGood === null ? null : (delta.direction === "up") === delta.upIsGood
  const Icon = !delta || delta.direction === "flat" ? ArrowRight : delta.direction === "up" ? ArrowUpRight : ArrowDownRight
  // Só elementos de frase (span): o cartão pode ser um botão ou um link.
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alert ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-overdue" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "mt-1 block font-display text-xl leading-7 font-semibold tracking-tight sm:text-[22px]",
          alert ? "text-overdue" : "text-foreground"
        )}
      >
        {value}
      </span>
      {delta ? (
        <span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              good === true ? "text-success-ink" : good === false ? "text-overdue" : "text-muted-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {delta.text}
          </span>
          <span className="text-muted-foreground">{delta.comparedTo}</span>
        </span>
      ) : null}
      {trend && trend.filter((value) => value !== null).length > 1 ? <Sparkline values={trend} className="mt-2" /> : null}
      {hint ? <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span> : null}
      {footer}
    </>
  )
  const base = cn("block rounded-xl border bg-card px-4 py-3.5", className)
  const interactive = "w-full text-left transition-colors hover:border-foreground/15 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cn(base, interactive)}>
        {body}
      </button>
    )
  }
  return href ? (
    <Link href={href} className={cn(base, interactive)}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
