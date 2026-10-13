import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Página de detalhe carregando: cabeçalho e os cartões, sem linha de filtros. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-x-8">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="hidden h-48 rounded-xl xl:block" />
      </div>
    </PageSkeleton>
  )
}
