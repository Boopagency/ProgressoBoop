"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { portalHref, selectedClient } from "@/features/portal/links"
import { isPortalDetail, portalSectionOf } from "@/features/portal/portal-nav"
import type { PortalClient } from "@/features/portal/session"

/**
 * Topo do portal, como o do admin (`AppTopbar`): abre e fecha o menu e
 * mostra a seção atual; no post ou no projeto aberto, a seção vira o
 * "voltar", para o título da página ficar na mesma altura das listas.
 */
export function PortalTopbar({ clients }: { clients: readonly PortalClient[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = portalSectionOf(pathname)
  const client = selectedClient(clients, searchParams.get("cliente"))

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-sm md:px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      {current ? (
        isPortalDetail(pathname) ? (
          <Link
            href={client ? portalHref(current.href, client, clients) : current.href}
            className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {current.title}
          </Link>
        ) : (
          <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <current.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {current.title}
          </span>
        )
      ) : null}
    </header>
  )
}
