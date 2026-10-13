import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Hoje carregando: resumo, listas à esquerda e a coluna da direita. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <Skeleton className="h-[92px] w-full rounded-xl" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ListSkeleton sections={3} />
        <div className="hidden space-y-6 lg:block">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </PageSkeleton>
  )
}
