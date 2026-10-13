import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Portal carregando, com a geometria das telas: o título e o primeiro bloco
 * já ficam onde a tela vai mostrá-los, e a troca de tela dá retorno na hora
 * (sem o esqueleto, a tela anterior ficava parada até a nova chegar).
 */
export default function Loading() {
  return (
    <PageSkeleton actions={false}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
        <div className="space-y-8">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="hidden h-56 rounded-xl lg:block" />
      </div>
    </PageSkeleton>
  )
}
