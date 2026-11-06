import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Painel de destaque de uma tela (o `glass-panel`, um por tela): vidro fosco
 * com uma luz azul atrás. `light="corner"` (padrão) é a luz vinda do canto
 * (Financeiro, Indicadores, Metas, projeto); `"aurora"` são as faixas
 * verticais das aberturas (Hoje, Início do portal); `"none"` quando a tela
 * põe a própria luz (ex.: âmbar no financeiro do portal com atraso). Os
 * números do painel vão num `StatGrid variant="line"`.
 */
export function HeroPanel({
  light = "corner",
  className,
  children,
  ...props
}: ComponentProps<"section"> & { light?: "corner" | "aurora" | "none" }) {
  return (
    <section
      className={cn("relative isolate overflow-hidden rounded-[2rem] glass-panel px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8", className)}
      {...props}
    >
      {light === "corner" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/2 -right-[15%] -z-10 h-[170%] w-[70%] bg-[radial-gradient(closest-side,var(--glow-soft),transparent)]"
        />
      ) : light === "aurora" ? (
        <div aria-hidden="true" className="hero-aurora" />
      ) : null}
      {light === "aurora" ? <div className="relative z-10">{children}</div> : children}
    </section>
  )
}

/**
 * Etiqueta em pílula de contorno fino, com o ponto azul que brilha: a data
 * do Hoje, o cliente no portal, o período dos painéis de gestão.
 */
export function HeroEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-2 rounded-full border border-foreground/20 px-3 eyebrow text-foreground/85",
        className
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-glow shadow-[0_0_10px_var(--glow)]" />
      <span className="truncate">{children}</span>
    </p>
  )
}
