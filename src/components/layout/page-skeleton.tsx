import type { ReactNode } from "react"

import { PageBody, PageContainer, PageHeaderSkeleton } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/*
 * Peças dos `loading.tsx`: a moldura, o cabeçalho e a linha de filtros com a
 * geometria das telas (seção 8.1 da arquitetura), para nada mudar de lugar
 * quando a tela chega. O esqueleto não anima; a tela que chega entra com o fade.
 */

/** Tela carregando: cabeçalho, linha de filtros (opcional) e o corpo. */
export function PageSkeleton({
  toolbar = false,
  actions = true,
  children,
}: {
  /** A tela tem PageToolbar (filtros ou modos de ver). */
  toolbar?: boolean
  /** A tela tem botões no cabeçalho (no portal, não tem). */
  actions?: boolean
  children: ReactNode
}) {
  return (
    <PageContainer animate={false} aria-busy="true" aria-label="Carregando">
      <PageHeaderSkeleton actions={actions} />
      {toolbar ? (
        <div className="mt-6 flex min-h-9 items-center gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="hidden h-8 w-32 sm:block" />
        </div>
      ) : null}
      <PageBody>{children}</PageBody>
    </PageContainer>
  )
}

/** Quatro indicadores (KpiTile), como em Conteúdo e Comercial. */
export function TilesSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {[0, 1, 2, 3].map((tile) => (
        <Skeleton key={tile} className="h-[92px] rounded-xl" />
      ))}
    </div>
  )
}

/** Seções com linhas de tarefa (título da seção e três linhas cada). */
export function ListSkeleton({ sections = 2, className }: { sections?: number; className?: string }) {
  return (
    <div className={cn("space-y-8", className)}>
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className="space-y-4">
          <Skeleton className="h-4 w-28" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-start gap-3">
              <Skeleton className="size-[18px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
