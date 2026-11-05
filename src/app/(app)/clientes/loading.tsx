import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Clientes carregando: o painel das revisões e os cartões (sem linha de filtros). */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-[150px] w-full rounded-3xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <Skeleton key={card} className="h-[230px] rounded-3xl" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
