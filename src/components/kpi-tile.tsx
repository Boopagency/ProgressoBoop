import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Sparkline } from "@/components/charts/sparkline"
import { DisplayValue } from "@/components/display-value"
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
  display = false,
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
  /** Número grande na serifada itálica (telas de gestão), com rótulo em caixa alta. */
  display?: boolean
  className?: string
}) {
  const good =
    !delta || delta.direction === "flat" || delta.upIsGood === null ? null : (delta.direction === "up") === delta.upIsGood
  const Icon = !delta || delta.direction === "flat" ? ArrowRight : delta.direction === "up" ? ArrowUpRight : ArrowDownRight
  // Só elementos de frase (span): o cartão pode ser um botão ou um link.
  const body = (
    <>
      <span className={cn("flex items-center gap-1.5 text-muted-foreground", display ? "eyebrow" : "text-xs")}>
        {alert ? (
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full bg-overdue", display && "shadow-[0_0_8px_var(--overdue)]")} />
        ) : null}
        {label}
      </span>
      {display ? (
        <span className={cn("mt-3 block text-[34px] leading-[0.95] sm:text-[38px]", alert ? "text-overdue" : "text-foreground")}>
          {typeof value === "string" ? <DisplayValue value={value} /> : <span className="display-number">{value}</span>}
        </span>
      ) : (
        <span
          className={cn(
            "mt-1 block font-display text-xl leading-7 font-semibold tracking-tight sm:text-[22px]",
            alert ? "text-overdue" : "text-foreground"
          )}
        >
          {value}
        </span>
      )}
      {delta ? (
        <span className={cn("flex flex-wrap items-center gap-x-1 text-xs", display ? "mt-2" : "mt-1")}>
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
  const base = cn("block rounded-2xl border bg-card px-5", display ? "py-5" : "py-4", className)
  const interactive = cn(
    "w-full text-left transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-ring",
    display && "transition-[box-shadow,border-color] hover:border-glow/40"
  )
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
