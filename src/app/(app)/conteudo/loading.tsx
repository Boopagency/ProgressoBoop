import { PageSkeleton, TilesSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Conteúdo carregando: filtros, os números e o calendário. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <TilesSkeleton />
      <Skeleton className="h-[460px] w-full rounded-xl" />
    </PageSkeleton>
  )
}
