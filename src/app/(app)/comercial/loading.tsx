import { PageBody, PageContainer } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Comercial carregando, com a geometria da tela: a etiqueta e a frase do
 * funil (duas linhas), os filtros e o quadro (faixas recolhidas e colunas).
 */
export default function Loading() {
  return (
    <PageContainer
      animate={false}
      aria-busy="true"
      aria-label="Carregando"
      className="motion-safe:animate-skeleton-in md:flex md:h-full md:flex-col md:pb-6"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-48 rounded-full" />
          <Skeleton className="mt-4 h-[38px] w-4/5 max-w-[46rem] sm:h-[50px] xl:h-[60px]" />
          <Skeleton className="mt-2 h-[38px] w-3/5 max-w-[30rem] sm:h-[50px] xl:h-[60px]" />
        </div>
        <div className="flex flex-col gap-4 lg:w-[23rem] lg:items-end">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="mt-8 flex min-h-9 flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full rounded-full sm:w-72" />
        <Skeleton className="hidden h-9 w-48 rounded-full sm:block" />
        <Skeleton className="hidden h-9 w-40 rounded-full sm:block" />
      </div>
      <PageBody className="md:min-h-0 md:flex-1">
        <div className="flex h-[calc(100svh-11rem)] min-h-[26rem] gap-3 overflow-hidden md:h-auto md:flex-1">
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
          {[0, 1, 2].map((column) => (
            <Skeleton key={column} className="w-[86%] shrink-0 rounded-3xl sm:w-[18.5rem] lg:w-auto lg:max-w-[26rem] lg:min-w-[18.5rem] lg:flex-1 lg:basis-0" />
          ))}
          <Skeleton className="w-12 shrink-0 rounded-3xl" />
        </div>
      </PageBody>
    </PageContainer>
  )
}
