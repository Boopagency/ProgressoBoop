import Link from "next/link"
import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface NumberTileItem {
  label: string
  value: ReactNode
  /** Texto do valor por extenso (ex.: o valor exato quando o número aparece abreviado). */
  title?: string
  /** Unidade ou complemento pequeno ao lado do número (ex.: "posts", "/mês"). */
  unit?: ReactNode
  /** Linha de apoio, abaixo do número. */
  hint?: ReactNode
  /** Número que pede atenção (vermelho, só para status). */
  alert?: boolean
  /** Destaque azul (o número em foco da tela). */
  accent?: boolean
  href?: string
  onSelect?: () => void
}

/**
 * Indicadores do topo das telas de lista (Conteúdo, Comercial, Clientes):
 * rótulo em `eyebrow`, o número grande na serifada itálica (`display-number`)
 * e uma linha de apoio. Cada um pode levar à visão que forma o número.
 * Cartões de vidro discretos (`bg-card` + `border`, sem desfoque).
 */
export function NumberTiles({ items, className }: { items: NumberTileItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>
      {items.map((item) => {
        const body = (
          <>
            <span className="flex items-start gap-1.5 eyebrow text-muted-foreground max-sm:text-[10px] max-sm:tracking-[0.1em]">
              {item.alert ? (
                <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full bg-overdue shadow-[0_0_8px_var(--overdue)]" />
              ) : item.accent ? (
                <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full bg-glow shadow-[0_0_8px_var(--glow)]" />
              ) : null}
              <span className="line-clamp-2 min-w-0">{item.label}</span>
            </span>
            <span className="mt-2.5 flex min-w-0 items-baseline gap-1.5">
              <span
                title={item.title}
                className={cn(
                  "display-number text-[40px] leading-[0.9] sm:text-[48px]",
                  item.alert ? "text-overdue" : item.accent ? "text-brand-ink" : "text-foreground"
                )}
              >
                {item.value}
              </span>
              {item.unit ? <span className="truncate text-[13px] text-muted-foreground">{item.unit}</span> : null}
            </span>
            {item.hint ? <span className="mt-2 line-clamp-2 text-xs leading-4 text-muted-foreground">{item.hint}</span> : null}
          </>
        )
        const base = "relative flex min-w-0 flex-col rounded-2xl border bg-card px-4 py-4 text-left sm:px-5 sm:py-5"
        const interactive =
          "outline-none transition-[border-color,box-shadow] duration-150 hover:border-glow/40 hover:shadow-float focus-visible:ring-[3px] focus-visible:ring-ring/40"
        if (item.onSelect) {
          return (
            <button key={item.label} type="button" onClick={item.onSelect} className={cn(base, interactive)}>
              {body}
            </button>
          )
        }
        return item.href ? (
          <Link key={item.label} href={item.href} className={cn(base, interactive)}>
            {body}
          </Link>
        ) : (
          <div key={item.label} className={base}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

/** Os indicadores carregando, com a mesma altura dos cartões (nada pula quando chegam). */
export function NumberTilesSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>
      {[0, 1, 2, 3].map((tile) => (
        <Skeleton key={tile} className="h-[134px] rounded-2xl" />
      ))}
    </div>
  )
}
