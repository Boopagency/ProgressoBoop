import { PageBody, PageContainer, PageHeaderSkeleton } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto genérico enquanto uma tela carrega, com a geometria das telas
 * (PageHeader e PageBody): o título e o primeiro bloco já ficam onde a tela
 * vai mostrá-los. Não anima; a tela que chega entra com o fade.
 */
export default function Loading() {
  return (
    <PageContainer animate={false} aria-busy="true" aria-label="Carregando">
      <PageHeaderSkeleton />
      <PageBody>
        <Skeleton className="h-[92px] w-full rounded-xl" />
        <div className="max-w-3xl space-y-8">
          {[0, 1].map((section) => (
            <div key={section} className="space-y-4">
              <Skeleton className="h-4 w-28" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-start gap-3">
                  <Skeleton className="size-[18px] rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PageBody>
    </PageContainer>
  )
}
