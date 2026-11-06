import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/** Metas carregando: o painel de resumo, os filtros e os objetivos. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-[300px] w-full rounded-[2rem]" />
      <Skeleton className="h-9 w-80 max-w-full rounded-full" />
      <ListSkeleton className="max-w-[1080px]" />
    </PageSkeleton>
  )
}
