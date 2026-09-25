import { PageContainer } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto genérico enquanto uma tela carrega: título, resumo e lista. */
export default function Loading() {
  return (
    <PageContainer aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="mt-8 h-[92px] w-full rounded-xl" />
      <div className="mt-10 max-w-3xl space-y-8">
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
    </PageContainer>
  )
}
