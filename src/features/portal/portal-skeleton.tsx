import type { ReactNode } from "react"

import { PageBody, PageContainer } from "@/components/layout/page"
import { PortalHeaderSkeleton } from "@/features/portal/portal-ui"

/**
 * Tela do portal carregando, com a geometria do `PortalHeader` (a pílula, o
 * título grande e os números ao lado): nada muda de lugar quando a tela
 * chega. Aparece com um fade depois de um instante.
 */
export function PortalPageSkeleton({ stats = 0, children }: { stats?: number; children: ReactNode }) {
  return (
    <PageContainer animate={false} aria-busy="true" aria-label="Carregando" className="motion-safe:animate-skeleton-in">
      <PortalHeaderSkeleton stats={stats} />
      <PageBody>{children}</PageBody>
    </PageContainer>
  )
}
