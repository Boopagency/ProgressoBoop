import { Skeleton } from "@/components/ui/skeleton"
import { PortalPageSkeleton } from "@/features/portal/portal-skeleton"

/** Post do portal carregando: as imagens à esquerda e a conversa ao lado. */
export default function Loading() {
  return (
    <PortalPageSkeleton>
      <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
        <Skeleton className="aspect-[4/5] w-full rounded-[1.75rem]" />
        <Skeleton className="h-96 rounded-[1.75rem] md:h-[560px]" />
      </div>
    </PortalPageSkeleton>
  )
}
