import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/*
 * Peças comuns das telas do portal (repaginada de nov/2026): o cabeçalho com
 * o cliente em pílula, o título com uma palavra em serifada itálica e os
 * números grandes ao lado; os vazios; os títulos de seção. Server Components.
 */

/** O cliente em pílula de contorno fino, com o ponto azul (o mesmo do Início). */
export function ClientPill({ name, className }: { name: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-2 rounded-full border border-foreground/20 px-3 eyebrow text-foreground/85",
        className
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-glow shadow-[0_0_10px_var(--glow)]" />
      <span className="truncate">{name}</span>
    </p>
  )
}

export interface HeaderStat {
  label: string
  value: ReactNode
  /** Âncora opcional (ex.: "#em-aberto"). */
  href?: string
  /** Em vermelho (ex.: cobrança vencida). */
  alert?: boolean
}

/** Os números do cabeçalho: rótulo pequeno em caixa alta e o número grande na serifada. */
function HeaderStats({ items }: { items: HeaderStat[] }) {
  return (
    <div className="flex shrink-0 gap-6 sm:gap-8">
      {items.map((item) => {
        const content = (
          <>
            <p className="flex items-center gap-1.5 eyebrow whitespace-nowrap text-muted-foreground">
              {item.alert ? (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue shadow-[0_0_8px_var(--overdue)]" />
              ) : null}
              {item.label}
            </p>
            <p
              className={cn(
                "mt-2 display-number text-[40px] leading-[0.85] sm:text-[52px]",
                item.alert ? "text-overdue" : "text-foreground"
              )}
            >
              {item.value}
            </p>
          </>
        )
        return item.href ? (
          <a
            key={item.label}
            href={item.href}
            className="min-w-0 border-t border-foreground/15 pt-2.5 outline-none transition-colors hover:border-glow focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {content}
          </a>
        ) : (
          <div key={item.label} className="min-w-0 border-t border-foreground/15 pt-2.5">
            {content}
          </div>
        )
      })}
    </div>
  )
}

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
        {eyebrow ?? (client ? <ClientPill name={client} /> : null)}
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
      {stats && stats.length > 0 ? <HeaderStats items={stats} /> : null}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * Vazio de uma tela ou de um quadro: o ícone num círculo que brilha, uma
 * frase curta e o que acontece quando chegar algo (e, se houver, uma ação).
 */
export function PortalEmpty({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  /** Dentro de um quadro: menos respiro e sem a borda. */
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-6 py-8" : "rounded-[1.75rem] border border-dashed border-foreground/15 px-6 py-14",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-glow/30 bg-glow-soft text-brand-ink shadow-[0_0_32px_-4px_var(--glow-soft)]"
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-display text-[17px] font-medium tracking-tight text-foreground">{title}</p>
      {children ? <p className="mt-1.5 max-w-sm text-[13.5px] leading-5 text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
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
