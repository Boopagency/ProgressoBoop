import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Área de conteúdo das telas: larga em telas grandes, com limite de 1400px. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 md:pt-8 lg:px-10 lg:pt-10",
        className
      )}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-9">
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Título de seção dentro de uma tela. */
export function SectionTitle({
  children,
  count,
  className,
  ...props
}: ComponentProps<"h2"> & { count?: number }) {
  return (
    <h2
      className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </h2>
  )
}
