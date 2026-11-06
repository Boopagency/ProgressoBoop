import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto das abas do financeiro (o título e as abas ficam na moldura): o painel do mês e as listas. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="motion-safe:animate-skeleton-in">
      <Skeleton className="h-[400px] w-full rounded-[2rem]" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="hidden h-80 w-full rounded-2xl xl:block" />
      </div>
    </div>
  )
}
