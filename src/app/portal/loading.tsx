import { Skeleton } from "@/components/ui/skeleton"
import { PortalPageSkeleton } from "@/features/portal/portal-skeleton"

/**
 * Portal carregando, com a geometria das telas: o cabeçalho e o primeiro
 * bloco já ficam onde a tela vai mostrá-los, e a troca de tela dá retorno na
 * hora (sem o esqueleto, a tela anterior ficava parada até a nova chegar).
 */
export default function Loading() {
  return (
    <PortalPageSkeleton stats={2}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <Skeleton className="h-48 rounded-[1.75rem]" />
          <Skeleton className="h-36 rounded-[1.75rem]" />
        </div>
        <Skeleton className="hidden h-64 rounded-[1.75rem] lg:block" />
      </div>
    </PortalPageSkeleton>
  )
}
