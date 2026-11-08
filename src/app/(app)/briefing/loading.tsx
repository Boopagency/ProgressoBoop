import { ListSkeleton, PageSkeleton } from "@/components/layout/page-skeleton"

/** A central: lista de briefings logo abaixo do cabeçalho e das abas. */
export default function Loading() {
  return (
    <PageSkeleton toolbar actions={false}>
      <ListSkeleton />
    </PageSkeleton>
  )
}
