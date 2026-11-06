import type { ReactNode } from "react"

import { HeroEyebrow } from "@/components/hero-panel"
import { StatGrid, type StatItem } from "@/components/stat-grid"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/*
 * Peças comuns das telas do portal (repaginada de nov/2026): o cabeçalho com
 * o cliente em pílula, o título com uma palavra em serifada itálica e os
 * números grandes ao lado; os títulos de seção. Os vazios são o `EmptyPanel`
 * e os números, o `StatGrid` (os mesmos do admin).
 */

/** Os números do cabeçalho (os mesmos do `StatGrid`; aqui, em linha). */
export type HeaderStat = Pick<StatItem, "label" | "value" | "href" | "alert">

/**
 * Cabeçalho das telas do portal: o cliente em pílula, o título grande (um
 * `<em>` vira a palavra de destaque, em serifada itálica no gradiente) e a
 * descrição; à direita, os números do momento ou as ações. No celular, os
 * números descem para baixo do título.
 */
export function PortalHeader({
  client,
  eyebrow,
  title,
  description,
  stats,
  actions,
  className,
}: {
  /** Nome do cliente na pílula. */
  client?: ReactNode
  /** No lugar da pílula do cliente (ex.: a situação do post). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  stats?: HeaderStat[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ?? (client ? <HeroEyebrow>{client}</HeroEyebrow> : null)}
        <h1
          className={cn(
            "font-display text-[34px] leading-[1.06] font-medium tracking-[-0.04em] break-words text-foreground sm:text-[44px]",
            (eyebrow ?? client) ? "mt-4" : null,
            "[&_em]:emphasis [&_em]:pr-[0.05em] [&_em]:text-[1.14em] [&_em]:leading-none [&_em]:text-gradient-brand"
          )}
        >
          {title}
        </h1>
        {description ? <div className="mt-2.5 max-w-2xl text-[15px] leading-6 text-muted-foreground">{description}</div> : null}
      </div>
      {stats && stats.length > 0 ? (
        <StatGrid variant="line" items={stats} className="flex shrink-0 gap-x-6 sm:gap-x-8 [&>*]:min-w-16" />
      ) : null}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Título de uma seção da tela (rótulo pequeno em caixa alta, com a contagem). */
export function PortalSectionTitle({
  id,
  children,
  count,
  action,
  className,
}: {
  id?: string
  children: ReactNode
  count?: number
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-7 items-center gap-2", className)}>
      <h2 id={id} className="flex items-center gap-2 eyebrow text-muted-foreground">
        {children}
        {count !== undefined ? (
          <span className="rounded-full bg-muted px-1.5 text-[11px] leading-[18px] font-semibold tracking-normal text-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  )
}

/** O cabeçalho do portal carregando: a pílula, o título e a linha da descrição. */
export function PortalHeaderSkeleton({ stats = 0 }: { stats?: number }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="mt-4 h-10 w-64 max-w-full sm:h-12 sm:w-80" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      </div>
      {stats > 0 ? (
        <div className="flex gap-8">
          {Array.from({ length: stats }, (_, index) => (
            <div key={index} className="w-20 space-y-3 border-t border-foreground/10 pt-2.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-12" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
