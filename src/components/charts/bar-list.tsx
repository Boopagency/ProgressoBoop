import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface BarListItem {
  key: string
  label: ReactNode
  value: number
  /** Valor como texto (ex.: "R$ 3.500 · 42%"). */
  display: ReactNode
  /** Linha pequena abaixo (ex.: "3 negócios"). */
  hint?: ReactNode
  href?: string
  /** Cor da barra (padrão: a da marca). */
  tone?: "primary" | "negative" | "muted"
}

const TONE = { primary: "bg-chart-1", negative: "bg-overdue", muted: "bg-chart-muted" }

/**
 * Lista com barras horizontais finas (funil, origens, concentração, idade das
 * contas): o nome e o valor em texto, a barra mostra a proporção. É também a
 * própria tabela do gráfico.
 */
export function BarList({
  items,
  max,
  emptyText = "Sem dados no período.",
  className,
}: {
  items: BarListItem[]
  /** Valor que enche a barra (padrão: o maior da lista). */
  max?: number
  emptyText?: string
  className?: string
}) {
  if (items.length === 0) return <p className={cn("text-[13px] text-muted-foreground", className)}>{emptyText}</p>
  const top = max ?? Math.max(...items.map((item) => item.value), 0)
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => {
        const width = top > 0 ? Math.max(item.value > 0 ? 2 : 0, (item.value / top) * 100) : 0
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-foreground">{item.label}</span>
              <span className="shrink-0 font-medium text-foreground tabular-nums">{item.display}</span>
            </span>
            <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", TONE[item.tone ?? "primary"])} style={{ width: `${Math.min(100, width)}%` }} />
            </span>
            {item.hint ? <span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span> : null}
          </>
        )
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="-mx-2 block rounded-md px-2 py-1 transition-colors hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
