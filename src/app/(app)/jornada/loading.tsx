import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Jornada carregando: os números e as colunas do quadro. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden lg:grid lg:grid-cols-4">
        {[0, 1, 2, 3].map((column) => (
          <Skeleton key={column} className="h-[360px] w-[82vw] max-w-[340px] shrink-0 rounded-2xl sm:w-[300px] lg:w-auto lg:max-w-none" />
        ))}
      </div>
    </PageSkeleton>
  )
}
