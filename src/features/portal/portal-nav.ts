import { Bell, CalendarDays, FolderKanban, House, LayoutGrid, MessagesSquare, type LucideIcon } from "lucide-react"

/*
 * Menu lateral do portal, no padrão do admin (`components/layout/nav-items.ts`).
 * Comunicação e Notificações levam o contador (não lidas e avisos não lidos).
 */

export interface PortalNavItem {
  title: string
  href: string
  icon: LucideIcon
  /** Contador ao lado do item. */
  badge?: "messages" | "notifications"
}

export const PORTAL_NAV: PortalNavItem[] = [
  { title: "Início", href: "/portal", icon: House },
  { title: "Calendário", href: "/portal/calendario", icon: CalendarDays },
  { title: "Feed", href: "/portal/feed", icon: LayoutGrid },
  { title: "Projetos", href: "/portal/projetos", icon: FolderKanban },
  { title: "Comunicação", href: "/portal/comunicacao", icon: MessagesSquare, badge: "messages" },
  { title: "Notificações", href: "/portal/notificacoes", icon: Bell, badge: "notifications" },
]

/**
 * Item do menu da tela atual. O post aberto conta como Início (de onde o
 * cliente costuma chegar a ele); o projeto aberto, como Projetos.
 */
export function portalSectionOf(pathname: string): PortalNavItem | null {
  if (pathname === "/portal" || pathname.startsWith("/portal/posts/")) return PORTAL_NAV[0] ?? null
  return (
    PORTAL_NAV.find((item) => item.href !== "/portal" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ??
    null
  )
}

/** Página de dentro (post ou projeto aberto): no topo, a seção vira o "voltar". */
export function isPortalDetail(pathname: string): boolean {
  return pathname.startsWith("/portal/posts/") || pathname.startsWith("/portal/projetos/")
}
