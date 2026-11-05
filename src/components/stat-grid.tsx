import type { ReactNode } from "react"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export interface StatItem {
  label: string
  value: ReactNode
  /** Âncora opcional (ex.: "#atrasadas"). */
  href?: string
  /** Destaca em vermelho (ex.: há tarefas atrasadas). */
  alert?: boolean
  /** Texto pequeno ao lado do número (ex.: "4 de 10"). */
  detail?: ReactNode
  /** Percentual exibido como uma barra fina na base do indicador. */
  progress?: number
}

/**
 * Linha de indicadores: rótulo pequeno em caixa alta e o número grande na
 * serifada itálica. `cards` põe cada um no seu cartão de vidro; `line` é a
 * versão dos painéis de destaque (Hoje, Início do portal): sem cartão, com
 * uma linha-guia fina em cima de cada número.
 */
export function StatGrid({
  items,
  variant = "cards",
  className,
}: {
  items: StatItem[]
  variant?: "cards" | "line"
  className?: string
}) {
  const line = variant === "line"
  return (
    <dl
      className={cn(
        "grid",
        line ? "gap-x-5 gap-y-6 sm:gap-x-8" : "gap-3 sm:gap-4",
        items.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <dt className="flex items-center gap-1.5 eyebrow text-muted-foreground">
              {item.alert ? (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-overdue shadow-[0_0_8px_var(--overdue)]" />
              ) : null}
              {item.label}
            </dt>
            <dd className="mt-3 flex items-baseline gap-2">
              <span
                className={cn(
                  "display-number",
                  line ? "text-[52px] leading-[0.85] sm:text-[68px]" : "text-[44px] leading-[0.9] sm:text-[52px]",
                  item.alert ? "text-overdue" : "text-foreground"
                )}
              >
                {item.value}
              </span>
              {item.detail ? (
                <span className="text-xs text-muted-foreground tabular-nums">{item.detail}</span>
              ) : null}
            </dd>
            {item.progress !== undefined ? (
              <Progress
                value={item.progress}
                aria-label={item.label}
                className="absolute inset-x-0 bottom-0 h-[3px] rounded-none bg-muted"
              />
            ) : null}
          </>
        )
        const cellClass = line
          ? "group/stat relative flex flex-col justify-between border-t border-foreground/15 pt-3 outline-none transition-colors duration-150"
          : "relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card px-4 py-4 transition-[background-color,box-shadow,border-color] duration-150 outline-none sm:px-5 sm:py-5"
        const hover = line
          ? "hover:border-glow focus-visible:ring-[3px] focus-visible:ring-ring/40"
          : "hover:border-glow/40 hover:shadow-float focus-visible:ring-[3px] focus-visible:ring-ring/40"
        return item.href ? (
          <a key={item.label} href={item.href} className={cn(cellClass, hover)}>
            {content}
          </a>
        ) : (
          <div key={item.label} className={cellClass}>
            {content}
          </div>
        )
      })}
    </dl>
  )
}
