import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Vazio bonito e útil: o ícone num círculo de vidro com o brilho azul, o
 * título, o que vai aparecer ali e a ação que enche a tela.
 */
export function EmptyPanel({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-foreground/15 text-center",
        compact ? "px-5 py-8" : "px-6 py-14 sm:py-16",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-glow-soft blur-3xl"
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative flex items-center justify-center rounded-full border border-glass-edge bg-card text-brand-ink shadow-[inset_0_1px_0_var(--glass-highlight),0_0_24px_-6px_var(--glow)]",
          compact ? "size-10" : "size-12"
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <h2 className={cn("relative font-display font-medium tracking-tight text-foreground", compact ? "mt-3 text-[15px]" : "mt-4 text-lg")}>
        {title}
      </h2>
      {children ? (
        <div className={cn("relative mt-1.5 max-w-md text-muted-foreground", compact ? "text-[13px] leading-5" : "text-sm leading-6")}>
          {children}
        </div>
      ) : null}
      {action ? <div className={cn("relative flex flex-wrap justify-center gap-2", compact ? "mt-4" : "mt-6")}>{action}</div> : null}
    </div>
  )
}
