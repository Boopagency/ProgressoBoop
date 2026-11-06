import { PageSkeleton } from "@/components/layout/page-skeleton"
import { StatGridSkeleton } from "@/components/stat-grid"
import { Skeleton } from "@/components/ui/skeleton"

/** Conteúdo carregando: filtros, os números e o calendário. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <StatGridSkeleton />
      <Skeleton className="h-[460px] w-full rounded-3xl" />
    </PageSkeleton>
  )
}
