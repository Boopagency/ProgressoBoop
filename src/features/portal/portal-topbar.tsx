"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { portalHref, selectedClient } from "@/features/portal/links"
import { isPortalDetail, PORTAL_CONTENT_HREFS, PORTAL_NAV, portalSectionOf } from "@/features/portal/portal-nav"
import type { PortalClient } from "@/features/portal/session"
import { cn } from "@/lib/utils"

/**
 * Topo do portal, como o do admin (`AppTopbar`): abre e fecha o menu e
 * mostra a seção atual; no post ou no projeto aberto, a seção vira o
 * "voltar", para o título da página ficar na mesma altura das listas. No
 * celular, o menu fica embaixo (`PortalTabBar`) e, no Calendário e no Feed
 * (juntos em "Conteúdo"), o topo troca entre os dois.
 */
export function PortalTopbar({ clients }: { clients: readonly PortalClient[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = portalSectionOf(pathname)
  const client = selectedClient(clients, searchParams.get("cliente"))
  const href = (path: string) => (client ? portalHref(path, client, clients) : path)
  const inContent = current !== null && PORTAL_CONTENT_HREFS.includes(current.href)

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-sm max-md:h-[calc(3rem+env(safe-area-inset-top))] max-md:pt-[env(safe-area-inset-top)] md:px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground max-md:hidden" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4 max-md:hidden" />
      {inContent ? (
        <nav aria-label="Conteúdo" className="flex flex-1 rounded-lg bg-muted p-0.5 md:hidden">
          {PORTAL_NAV.filter((item) => PORTAL_CONTENT_HREFS.includes(item.href)).map((item) => (
            <Link
              key={item.href}
              href={href(item.href)}
              aria-current={item.href === current.href ? "page" : undefined}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                item.href === current.href &&
                  "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
              )}
            >
              <item.icon className={cn("size-3.5", item.href === current.href && "text-brand-ink")} aria-hidden="true" />
              {item.title}
            </Link>
          ))}
        </nav>
      ) : null}
      {current ? (
        isPortalDetail(pathname) ? (
          <Link
            href={href(current.href)}
            className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 max-md:h-11 max-md:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {current.title}
          </Link>
        ) : (
          <span className={cn("flex items-center gap-2 text-[13px] font-medium text-foreground", inContent && "max-md:hidden")}>
            <current.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {current.title}
          </span>
        )
      ) : null}
    </header>
  )
}
