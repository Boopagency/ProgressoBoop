import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Um briefing da central carregando: o painel do status e as duas colunas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[300px] rounded-3xl" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-x-8">
          <Skeleton className="h-[520px] rounded-3xl" />
          <Skeleton className="h-[360px] rounded-3xl max-xl:hidden" />
        </div>
      </div>
    </PageSkeleton>
  )
}
