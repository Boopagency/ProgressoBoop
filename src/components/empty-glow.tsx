import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Vazio das telas do dia a dia (Tarefas, Projetos, Reuniões): o ícone num
 * círculo de vidro com o brilho azul atrás, o título com uma palavra em
 * destaque (`<em>`), uma frase que diz o que fazer e as ações. Sem cartão
 * próprio além da borda tracejada, para não competir com as listas.
 */
export function EmptyGlow({
  icon,
  title,
  children,
  actions,
  compact = false,
  className,
}: {
  icon: ReactNode
  /** Título; uma palavra pode ir em `<em>` (serifada itálica). */
  title: ReactNode
  /** A frase de apoio. */
  children?: ReactNode
  actions?: ReactNode
  /** Versão baixa, para dentro de cartões. */
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden rounded-[1.75rem] border border-dashed border-foreground/15 text-center",
        compact ? "px-6 py-10" : "px-6 py-16 sm:py-20",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -z-10 size-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-glow-soft blur-3xl"
      />
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full border border-glass-edge bg-card text-brand-ink shadow-[inset_0_1px_0_var(--glass-highlight),0_0_0_6px_var(--glow-soft),0_12px_32px_-12px_var(--glow)] [&_svg]:size-6"
      >
        {icon}
      </span>
      <h2 className="mt-6 font-display text-xl leading-7 font-medium tracking-[-0.02em] text-foreground sm:text-2xl [&_em]:emphasis [&_em]:pr-[0.04em] [&_em]:text-[1.14em] [&_em]:text-brand-ink">
        {title}
      </h2>
      {children ? <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{children}</p> : null}
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
