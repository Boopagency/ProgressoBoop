import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto das abas do financeiro (o título e as abas ficam na moldura). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-56" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 w-full rounded-xl" />
    </div>
  )
}
