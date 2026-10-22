"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { NotificationFeed } from "@/features/notifications/logic"
import { NotificationBell } from "@/features/notifications/notification-bell"
import { SearchButton } from "@/features/search/command-palette"

/** Seções cujas sub-rotas são abas da mesma tela, não páginas de detalhe. */
const TABBED_SECTIONS = new Set(["/financeiro"])

/**
 * Topo da área logada: abre e fecha o menu, mostra a seção atual (ou o
 * "voltar" para ela, nas páginas de dentro), a busca e o sino. No celular, o
 * menu fica embaixo (`AppTabBar`).
 */
export function AppTopbar({ notifications }: { notifications: NotificationFeed }) {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((item) => isActivePath(pathname, item.href))
  const isDetail = current ? pathname !== current.href && !TABBED_SECTIONS.has(current.href) : false

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 bg-canvas/85 px-3 backdrop-blur-md max-md:h-[calc(3rem+env(safe-area-inset-top))] max-md:border-b max-md:border-border/70 md:h-16 md:px-6 max-md:pt-[env(safe-area-inset-top)] md:px-4">
      <SidebarTrigger className="-ml-1 size-9 rounded-full bg-card text-muted-foreground shadow-card hover:bg-card hover:text-foreground max-md:hidden" />
      
      {current ? (
        isDetail ? (
          // Numa página de detalhe (cliente, projeto, reunião…), a seção vira o
          // "voltar": a página não repete o link acima do título, que fica na
          // mesma altura das listas.
          <Link
            href={current.href}
            className="-ml-1 flex items-center gap-1 rounded-full px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 max-md:h-11 max-md:pr-3 md:ml-0 md:h-9 md:bg-card md:px-3.5 md:shadow-card"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {current.title}
          </Link>
        ) : (
          <span className="flex items-center gap-2 text-[13px] font-medium text-foreground md:h-9 md:rounded-full md:bg-card md:px-3.5 md:shadow-card">
            <current.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {current.title}
          </span>
        )
      ) : null}
      <SearchButton className="ml-auto" />
      <NotificationBell initial={notifications} />
    </header>
  )
}
