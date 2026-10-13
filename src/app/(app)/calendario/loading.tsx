import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Calendário carregando: a navegação e a grade da semana. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <Skeleton className="h-[460px] w-full rounded-xl" />
    </PageSkeleton>
  )
}
