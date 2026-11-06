import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { DisplayValue } from "@/components/display-value"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface StatItem {
  label: string
  /** Texto (dinheiro, percentual, unidade: vira `DisplayValue`) ou número. */
  value: ReactNode
  /** Chave da linha, quando o rótulo pode repetir. */
  key?: string
  /** Valor por extenso (ex.: o exato quando o número aparece abreviado). */
  title?: string
  /** Unidade ou complemento pequeno ao lado do número (ex.: "posts", "de 12"). */
  unit?: ReactNode
  /** Linha de apoio, abaixo do número. */
  hint?: ReactNode
  /** Pede atenção (vermelho, só para status). */
  alert?: boolean
  /** Destaque azul (o número em foco da tela). */
  accent?: boolean
  /** Leva à visão que forma o número (rota ou âncora). */
  href?: string
  /** Troca a visão da própria tela (no lugar do link). */
  onSelect?: () => void
  /** 0 a 100: barra fina embaixo (ex.: recebido do mês). */
  progress?: number
}

/** Números curtos (contagens, "66%") cabem mais por linha; dinheiro precisa de espaço. */
function isShort(value: ReactNode) {
  return typeof value === "number" || (typeof value === "string" && value.length <= 6)
}

/**
 * Linha de números grandes: rótulo `eyebrow`, o número na serifada itálica
 * (`display-number`; texto passa pelo `DisplayValue`, com "R$", centavos e
 * unidade menores) e a linha de apoio. Cada número pode levar à visão que o
 * forma.
 *
 * - `cards`: cada número no seu cartão de vidro (`bg-card` + `border`), no
 *   topo das telas de lista (Conteúdo, Comercial, cliente).
 * - `line`: sem cartão, com uma linha-guia fina em cima, dentro dos painéis
 *   de destaque (`HeroPanel`) e do cabeçalho do portal. `size="lg"` é o
 *   número maior das aberturas (Hoje, Início do portal).
 */
export function StatGrid({
  items,
  variant = "cards",
  size = "md",
  className,
}: {
  items: StatItem[]
  variant?: "cards" | "line"
  size?: "md" | "lg"
  className?: string
}) {
  const line = variant === "line"
  const short = items.every((item) => isShort(item.value))
  return (
    <div
      className={cn(
        "grid",
        line
          ? cn(
              "gap-x-5 gap-y-6 sm:gap-x-8",
              short
                ? cn(items.length === 3 ? "grid-cols-3" : "grid-cols-2", "sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]")
                : "grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
            )
          : "grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4",
        className
      )}
      style={{ "--cols": items.length } as CSSProperties}
    >
      {items.map((item) => {
        const tone = item.alert ? "text-overdue" : item.accent ? "text-brand-ink" : "text-foreground"
        const numberSize = !line
          ? "text-[40px] leading-[0.9] sm:text-[48px]"
          : size === "lg"
            ? "text-[52px] leading-[0.85] sm:text-[68px]"
            : "text-[40px] leading-[0.9] sm:text-[48px]"
        const body = (
          <>
            <span className="flex items-start gap-1.5 eyebrow text-muted-foreground max-sm:text-[10px] max-sm:tracking-[0.1em]">
              {item.alert || item.accent ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[5px] size-1.5 shrink-0 rounded-full max-sm:mt-1",
                    item.alert ? "bg-overdue shadow-[0_0_8px_var(--overdue)]" : "bg-glow shadow-[0_0_8px_var(--glow)]"
                  )}
                />
              ) : null}
              <span className={cn("min-w-0", !line && "line-clamp-2")}>{item.label}</span>
            </span>
            <span className={cn("block", line ? "mt-3" : "mt-2.5")}>
              <span className="flex min-w-0 items-baseline gap-1.5">
                {typeof item.value === "string" ? (
                  <DisplayValue value={item.value} className={cn("block", numberSize, tone)} />
                ) : (
                  <span title={item.title} className={cn("display-number", numberSize, tone)}>
                    {item.value}
                  </span>
                )}
                {item.unit ? <span className="truncate text-[13px] text-muted-foreground tabular-nums">{item.unit}</span> : null}
              </span>
              {line && item.progress !== undefined ? (
                <span aria-hidden="true" className="mt-3 block h-[3px] overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className="block h-full rounded-full bg-(image:--gradient-brand) shadow-[0_0_10px_var(--glow)]"
                    style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                  />
                </span>
              ) : null}
              {item.hint ? (
                <span className={cn("mt-2 block text-xs text-muted-foreground", line ? "leading-5" : "line-clamp-2 leading-4")}>
                  {item.hint}
                </span>
              ) : null}
            </span>
            {!line && item.progress !== undefined ? (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-muted">
                <span className="block h-full bg-(image:--gradient-brand)" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
              </span>
            ) : null}
          </>
        )
        const cell = line
          ? "relative block min-w-0 border-t border-foreground/15 pt-3 text-left outline-none transition-colors duration-150"
          : "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card px-4 py-4 text-left outline-none transition-[border-color,box-shadow] duration-150 sm:px-5 sm:py-5"
        const interactive = cn(
          "focus-visible:ring-[3px] focus-visible:ring-ring/40",
          line ? "hover:border-glow" : "hover:border-glow/40 hover:shadow-float"
        )
        const key = item.key ?? item.label
        if (item.onSelect) {
          return (
            <button key={key} type="button" onClick={item.onSelect} className={cn(cell, interactive)}>
              {body}
            </button>
          )
        }
        return item.href ? (
          <Link key={key} href={item.href} className={cn(cell, interactive)}>
            {body}
          </Link>
        ) : (
          <div key={key} className={cell}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

/** Os números carregando, com a mesma altura dos cartões (nada pula quando chegam). */
export function StatGridSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>
      {[0, 1, 2, 3].map((tile) => (
        <Skeleton key={tile} className="h-[134px] rounded-2xl" />
      ))}
    </div>
  )
}
