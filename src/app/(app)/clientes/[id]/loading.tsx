import { PageSkeleton } from "@/components/layout/page-skeleton"
import { StatGridSkeleton } from "@/components/stat-grid"
import { Skeleton } from "@/components/ui/skeleton"

/** Página do cliente carregando: os números, as abas e as duas colunas da visão geral. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-6">
        <StatGridSkeleton />
        <Skeleton className="h-11 w-full max-w-[730px] rounded-full" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-x-8">
          <Skeleton className="h-[520px] rounded-3xl" />
          <Skeleton className="h-[360px] rounded-3xl max-xl:hidden" />
        </div>
      </div>
    </PageSkeleton>
  )
}
