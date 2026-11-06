import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Indicadores carregando: o painel do período (com as áreas) e os números. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-[248px] w-full rounded-[2rem] sm:h-[268px]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((tile) => (
          <Skeleton key={tile} className="h-[168px] rounded-2xl" />
        ))}
      </div>
    </PageSkeleton>
  )
}
