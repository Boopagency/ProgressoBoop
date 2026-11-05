"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { TOPBAR_CLASS, TOPBAR_SECTION_CLASS, TOPBAR_TRIGGER_CLASS } from "@/components/layout/shell-classes"
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
    <header className={TOPBAR_CLASS}>
      <SidebarTrigger className={TOPBAR_TRIGGER_CLASS} />
      
      {current ? (
        isDetail ? (
          // Numa página de detalhe (cliente, projeto, reunião…), a seção vira o
          // "voltar": a página não repete o link acima do título, que fica na
          // mesma altura das listas.
          <Link
            href={current.href}
            className="-ml-1 flex items-center gap-1 rounded-full px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 max-md:h-11 max-md:pr-3 md:ml-0 md:h-9 md:border md:border-glass-edge md:bg-card md:px-3.5 md:shadow-[inset_0_1px_0_var(--glass-highlight)]"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {current.title}
          </Link>
        ) : (
          <span className={TOPBAR_SECTION_CLASS}>
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
