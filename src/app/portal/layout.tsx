import { cookies } from "next/headers"
import type { ReactNode } from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { fetchPortalUnreadMessages } from "@/features/portal/channel-queries"
import { NO_PORTAL_COUNTS, type PortalCounts } from "@/features/portal/notification-logic"
import { fetchPortalUnreadCount } from "@/features/portal/notification-queries"
import { PortalAlertsProvider } from "@/features/portal/portal-alerts"
import { PortalSidebar } from "@/features/portal/portal-sidebar"
import { PortalTabBar } from "@/features/portal/portal-tab-bar"
import { PortalTopbar } from "@/features/portal/portal-topbar"
import { requirePortalUser, type PortalUser } from "@/features/portal/session"
import { PushRefresh } from "@/features/push/push-refresh"
import { createClient } from "@/lib/supabase/server"

/**
 * Contagens iniciais do menu (do primeiro cliente; o menu confere o escolhido
 * logo depois). Se falhar, o portal abre do mesmo jeito, sem os contadores.
 */
async function initialCounts(user: PortalUser): Promise<PortalCounts> {
  const first = user.clients[0]
  if (!first) return NO_PORTAL_COUNTS
  try {
    const supabase = await createClient()
    const [messages, notifications] = await Promise.all([fetchPortalUnreadMessages(supabase, first.id), fetchPortalUnreadCount(supabase)])
    return { messages, notifications }
  } catch {
    return NO_PORTAL_COUNTS
  }
}

/**
 * Área do cliente, com a mesma lógica visual do admin: menu lateral à
 * esquerda (recolhível; no celular, o menu de baixo), topo com o botão do
 * menu e a seção, e as telas no painel. Só contas com acesso de cliente
 * entram; a equipe usa o admin.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const [user, cookieStore] = await Promise.all([requirePortalUser(), cookies()])
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const counts = await initialCounts(user)

  return (
    <PortalAlertsProvider userId={user.id} clients={user.clients} initial={counts}>
      {/* No celular, o menu fica embaixo (PortalTabBar); --app-bottom-bar é a altura dele. */}
      <SidebarProvider defaultOpen={sidebarOpen} className="max-md:[--app-bottom-bar:calc(3.5rem+env(safe-area-inset-bottom))]">
        <PortalSidebar user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }} clients={user.clients} />
        <SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/80 md:peer-data-[variant=inset]:shadow-[0_1px_3px_0_rgb(0_0_0/0.03)]">
          <PortalTopbar clients={user.clients} />
          <div className="portal-motion flex-1 max-md:pb-(--app-bottom-bar) md:overflow-y-auto">{children}</div>
        </SidebarInset>
        <PortalTabBar user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }} clients={user.clients} />
        <PushRefresh />
      </SidebarProvider>
    </PortalAlertsProvider>
  )
}
