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

/** Linha de indicadores discretos, divididos por linhas finas. */
export function StatGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4",
        className
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {item.alert ? (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-overdue" />
              ) : null}
              {item.label}
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display text-[26px] leading-8 font-semibold tracking-tight tabular-nums",
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
        const cellClass =
          "relative flex flex-col justify-between bg-background px-4 py-4 transition-colors outline-none sm:px-5"
        return item.href ? (
          <a
            key={item.label}
            href={item.href}
            className={cn(cellClass, "hover:bg-muted/50 focus-visible:bg-muted/50")}
          >
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
