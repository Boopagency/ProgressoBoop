"use client"

import type { ReactNode } from "react"

import { PILL_ACTIVE, PillIndicator } from "@/components/pill-indicator"
import { cn } from "@/lib/utils"

export interface PillTab<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Contagem ao lado do nome (some quando é 0). */
  count?: number
  /** A contagem pede atenção (vermelho). */
  alert?: boolean
}

/**
 * Abas em pílula de uma página (seções do cliente): a pílula azul desliza até
 * a aba escolhida. No celular, a fileira rola para o lado dentro dela mesma
 * (a página não). Teclado: setas trocam de aba (padrão ARIA de abas).
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  idPrefix,
  className,
  "aria-label": ariaLabel,
}: {
  tabs: PillTab<T>[]
  value: T
  onValueChange: (value: T) => void
  /** Prefixo dos ids das abas e dos painéis (`<prefix>-tab-<valor>` e `<prefix>-painel-<valor>`). */
  idPrefix: string
  className?: string
  "aria-label": string
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.value === value)
    const next =
      event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    const tab = tabs[(next + tabs.length) % tabs.length]!
    onValueChange(tab.value)
    document.getElementById(`${idPrefix}-tab-${tab.value}`)?.focus()
  }

  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="group/pill relative inline-flex w-max rounded-full border border-glass-edge glass-surface p-1 shadow-[inset_0_1px_0_var(--glass-highlight),var(--shadow-card)]"
      >
        <PillIndicator selector="[aria-selected=true]" active={value} />
        {tabs.map((tab) => {
          const selected = tab.value === value
          return (
            <button
              key={tab.value}
              id={`${idPrefix}-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-painel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.value)}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5 [&_svg]:shrink-0",
                selected && PILL_ACTIVE
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[18px] font-semibold tabular-nums",
                    selected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : tab.alert
                        ? "bg-overdue/15 text-overdue"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
