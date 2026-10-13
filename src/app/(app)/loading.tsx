import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto genérico enquanto uma tela carrega, com a geometria das telas
 * (cabeçalho, linha de filtros e corpo): o título e o primeiro bloco já ficam
 * onde a tela vai mostrá-los. As telas sem linha de filtros e as maiores têm
 * o próprio `loading.tsx`.
 */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <Skeleton className="h-[92px] w-full rounded-xl" />
      <ListSkeleton className="max-w-3xl" />
    </PageSkeleton>
  )
}
