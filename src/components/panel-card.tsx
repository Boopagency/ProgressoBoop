import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Cartão das páginas de detalhe (cliente, projeto): título, ação à direita e conteúdo. */
export function PanelCard({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex min-h-12 items-center gap-2 border-b px-4 py-2.5">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
        </h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

/** Contagem discreta ao lado do título do cartão. */
export function PanelCount({ value }: { value: number }) {
  return <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{value}</span>
}
