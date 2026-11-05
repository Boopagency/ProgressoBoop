import Link from "next/link"
import type { ComponentProps, CSSProperties, ReactNode } from "react"

import { DisplayValue } from "@/components/display-value"
import { cn } from "@/lib/utils"

/**
 * Painel de destaque de uma tela (o `glass-panel`, um por tela): vidro fosco
 * com uma luz azul vinda do canto. As telas de gestão abrem com ele (o mês
 * do financeiro, o período dos indicadores, o trimestre das metas).
 */
export function HeroPanel({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("relative isolate overflow-hidden rounded-[2rem] glass-panel px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/2 -right-[15%] -z-10 h-[170%] w-[70%] bg-[radial-gradient(closest-side,var(--glow-soft),transparent)] motion-safe:transition-opacity"
      />
      {children}
    </section>
  )
}

/** Etiqueta em pílula do painel (com o ponto azul que brilha). */
export function HeroEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex h-7 items-center gap-2 rounded-full border border-foreground/20 px-3 eyebrow text-foreground/85", className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_10px_var(--glow)]" />
      {children}
    </p>
  )
}

export interface HeroFigure {
  key: string
  label: string
  /** Texto do número (dinheiro, percentual, contagem); vira número grande. */
  value: string
  hint?: ReactNode
  href?: string
  /** Pede atenção (vermelho). */
  alert?: boolean
  /** 0 a 100: barra fina embaixo (ex.: recebido do mês). */
  progress?: number
}

/**
 * Números do painel: linha-guia fina em cima, rótulo pequeno em caixa alta,
 * o número grande e a linha de apoio. Com `href`, leva aos dados de origem.
 */
export function HeroFigures({ items, className }: { items: HeroFigure[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-6 min-[420px]:grid-cols-2 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]", className)} style={{ "--cols": items.length } as CSSProperties}>
      {items.map((item) => {
        const body = (
          <>
            <dt className="flex items-center gap-1.5 eyebrow text-muted-foreground">
              {item.alert ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-overdue shadow-[0_0_8px_var(--overdue)]" /> : null}
              {item.label}
            </dt>
            <dd className="mt-3">
              <DisplayValue value={item.value} className={cn("block text-[40px] leading-[0.9] sm:text-[46px]", item.alert ? "text-overdue" : "text-foreground")} />
              {item.progress !== undefined ? (
                <span aria-hidden="true" className="mt-3 block h-[3px] overflow-hidden rounded-full bg-foreground/10">
                  <span className="block h-full rounded-full bg-(image:--gradient-brand) shadow-[0_0_10px_var(--glow)]" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
                </span>
              ) : null}
              {item.hint ? <span className="mt-2 block text-xs leading-5 text-muted-foreground">{item.hint}</span> : null}
            </dd>
          </>
        )
        const cell = "relative block border-t border-foreground/15 pt-3 outline-none transition-colors duration-150"
        return item.href ? (
          <Link key={item.key} href={item.href} className={cn(cell, "hover:border-glow focus-visible:ring-[3px] focus-visible:ring-ring/40")}>
            {body}
          </Link>
        ) : (
          <div key={item.key} className={cell}>
            {body}
          </div>
        )
      })}
    </dl>
  )
}
