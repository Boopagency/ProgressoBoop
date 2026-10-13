import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"

/** Tela sem linha de filtros: o conteúdo começa logo abaixo do cabeçalho. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ListSkeleton className="max-w-3xl" />
    </PageSkeleton>
  )
}
