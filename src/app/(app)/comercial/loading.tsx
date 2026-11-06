import { PageBody, PageContainer, PageHeaderSkeleton } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Comercial carregando, com a geometria da tela: cabeçalho, filtros e o
 * quadro ocupando o resto da janela (faixas recolhidas e colunas).
 */
export default function Loading() {
  return (
    <PageContainer
      animate={false}
      aria-busy="true"
      aria-label="Carregando"
      className="motion-safe:animate-skeleton-in md:flex md:h-full md:flex-col md:pb-6"
    >
      <PageHeaderSkeleton />
      <div className="mt-6 flex min-h-9 flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full rounded-full sm:w-56 xl:w-72" />
        <Skeleton className="hidden h-9 w-48 rounded-full sm:block" />
        <Skeleton className="hidden h-9 w-40 rounded-full sm:block" />
      </div>
      <PageBody className="md:min-h-0 md:flex-1">
        <div className="flex h-[calc(100svh-11rem)] min-h-[26rem] gap-3 overflow-hidden md:h-auto md:flex-1">
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
          {[0, 1, 2].map((column) => (
            <Skeleton key={column} className="w-[86%] shrink-0 rounded-3xl sm:w-[18rem]" />
          ))}
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
        </div>
      </PageBody>
    </PageContainer>
  )
}
