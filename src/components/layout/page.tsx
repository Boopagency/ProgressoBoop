import type { ComponentProps, ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/*
 * Esqueleto de toda tela do admin (docs/ARQUITETURA.md, seção 8.1):
 *
 *   PageContainer   moldura: mesma largura e margens em todas as telas
 *   ├─ PageHeader   título (sempre do mesmo tamanho), descrição e ações
 *   ├─ PageToolbar  opcional: filtros e modos de ver, logo abaixo do cabeçalho
 *   └─ PageBody     o conteúdo, sempre à mesma distância do cabeçalho
 *
 * Assim, ao trocar de tela, o título, a linha de filtros e o primeiro bloco
 * ficam no mesmo lugar. A largura da moldura não muda por tela: um conteúdo
 * de leitura (lista, formulário) limita a própria largura dentro do
 * PageBody, alinhado à esquerda, e o cabeçalho continua na moldura toda.
 */

/**
 * Moldura das telas: largura máxima de 1400px, centralizada, com as mesmas
 * margens em todas. Ao montar (troca de tela ou fim do carregamento), o
 * conteúdo entra com um fade curto (`animate-page-in`, desligado com
 * "reduzir movimento"); o menu e o topo ficam no layout e não se mexem.
 */
export function PageContainer({
  className,
  animate = true,
  ...props
}: ComponentProps<"div"> & {
  /** Entrada suave ao montar. O esqueleto de carregamento não anima. */
  animate?: boolean
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 md:pt-8 lg:px-10 lg:pt-10",
        animate && "motion-safe:animate-page-in",
        className
      )}
      {...props}
    />
  )
}

/**
 * Cabeçalho da tela, com altura fixa: o título tem sempre o mesmo tamanho e
 * fica numa linha só, e a linha da descrição é reservada mesmo sem
 * descrição, para o conteúdo não subir. No computador as ações ficam à
 * direita, alinhadas à base; no celular, abaixo do título.
 */
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
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1
          title={typeof title === "string" ? title : undefined}
          className="truncate font-display text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-9"
        >
          {title}
        </h1>
        <p className="min-h-5 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/**
 * Linha de filtros e modos de ver da tela, logo abaixo do cabeçalho. Fica
 * sempre no mesmo lugar e com a mesma altura; o que vai à direita usa
 * `ml-auto`. No celular, quebra em mais linhas.
 */
export function PageToolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-6 flex min-h-9 flex-wrap items-center gap-x-2 gap-y-3", className)}
      {...props}
    />
  )
}

/**
 * O conteúdo da tela: começa sempre 24px abaixo do cabeçalho (ou da linha de
 * filtros) e separa os blocos por 32px. `width="reading"` limita a largura a
 * 1080px (listas e formulários), alinhado à esquerda: o cabeçalho continua
 * na moldura toda.
 */
export function PageBody({
  className,
  width = "full",
  ...props
}: ComponentProps<"div"> & { width?: "full" | "reading" }) {
  return (
    <div
      data-slot="page-body"
      className={cn("mt-6 flex flex-col gap-8", width === "reading" && "max-w-[1080px]", className)}
      {...props}
    />
  )
}

/**
 * Descrição das páginas de detalhe: etiquetas e dados curtos na linha da
 * descrição do PageHeader, separados por "·" (os vazios somem).
 */
export function PageMeta({ items }: { items: ReactNode[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {items.filter(Boolean).map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden="true" className="text-subtle-foreground">
              ·
            </span>
          ) : null}
          {item}
        </span>
      ))}
    </span>
  )
}

/** Título de seção dentro de uma tela (altura fixa, com a contagem ao lado). */
export function SectionTitle({
  children,
  count,
  className,
  ...props
}: ComponentProps<"h2"> & { count?: number }) {
  return (
    <h2
      className={cn("flex min-h-6 items-center gap-2 text-sm font-semibold text-foreground", className)}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </h2>
  )
}

/**
 * O cabeçalho no carregamento, com a mesma geometria do PageHeader (título,
 * linha da descrição e ações), para nada mudar de lugar quando a tela chega.
 */
export function PageHeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <div className="flex h-8 items-center sm:h-9">
          <Skeleton className="h-6 w-48 sm:h-7 sm:w-56" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      {actions ? <Skeleton className="h-9 w-36 shrink-0" /> : null}
    </div>
  )
}
