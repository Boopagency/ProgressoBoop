import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"

/** Tarefas carregando: filtros e a lista por prazo. */
export default function Loading() {
  return (
    <PageSkeleton toolbar>
      <ListSkeleton sections={3} />
    </PageSkeleton>
  )
}
