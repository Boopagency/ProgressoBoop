import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Calendário do portal carregando: a linha do mês e a grade. */
export default function Loading() {
  return (
    <PageSkeleton toolbar actions={false}>
      <Skeleton className="h-[460px] w-full rounded-xl" />
    </PageSkeleton>
  )
}
