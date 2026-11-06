import { PageBody, PageContainer } from "@/components/layout/page"
import { Skeleton } from "@/components/ui/skeleton"

/** Projeto do portal carregando: o painel do andamento, as etapas e a conversa. */
export default function Loading() {
  return (
    <PageContainer animate={false} aria-busy="true" aria-label="Carregando" className="motion-safe:animate-skeleton-in">
      <Skeleton className="h-[300px] rounded-[2rem]" />
      <PageBody className="mt-8">
        <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
          <Skeleton className="h-[420px] rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem] md:h-[520px]" />
        </div>
      </PageBody>
    </PageContainer>
  )
}
