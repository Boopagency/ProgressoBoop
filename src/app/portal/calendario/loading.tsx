import { Skeleton } from "@/components/ui/skeleton"
import { PortalPageSkeleton } from "@/features/portal/portal-skeleton"

/** Calendário do portal carregando: o cabeçalho, a linha do mês e a grade. */
export default function Loading() {
  return (
    <PortalPageSkeleton stats={2}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="ml-auto hidden h-7 w-96 rounded-full lg:block" />
      </div>
      <Skeleton className="hidden h-[620px] w-full rounded-[1.75rem] md:block" />
      <div className="space-y-5 md:hidden">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex gap-3">
            <Skeleton className="h-14 w-11" />
            <Skeleton className="h-[72px] flex-1 rounded-2xl" />
          </div>
        ))}
      </div>
    </PortalPageSkeleton>
  )
}
