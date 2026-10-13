"use client"

import { Check, ChevronsUpDown, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { BoopMark } from "@/components/layout/boop-mark"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/features/auth/actions"
import { portalHref, selectedClient } from "@/features/portal/links"
import { countLabel } from "@/features/portal/notification-logic"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import { isPortalDetail, PORTAL_NAV, portalSectionOf } from "@/features/portal/portal-nav"
import type { PortalClient } from "@/features/portal/session"
import { cn } from "@/lib/utils"

/**
 * Menu lateral do portal, no padrão do admin (`AppSidebar`): a marca e, para
 * quem acompanha mais de um cliente, a troca de cliente no topo; as telas; e
 * quem está logado, com "Sair", no rodapé. No celular, o mesmo menu
 * recolhível (Sheet), que fecha ao navegar.
 */
export function PortalSidebar({
  user,
  clients,
}: {
  user: { name: string; email: string }
  clients: readonly PortalClient[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isMobile, setOpenMobile } = useSidebar()
  const client = selectedClient(clients, searchParams.get("cliente"))
  const active = portalSectionOf(pathname)
  const { counts } = usePortalAlerts()

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            {client && clients.length > 1 ? (
              <ClientSwitcher client={client} clients={clients} pathname={pathname} onNavigate={closeOnMobile} />
            ) : (
              <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
                <Link href="/portal" onClick={closeOnMobile}>
                  <Brand subtitle={client?.name ?? null} />
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1.5">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {PORTAL_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active?.href === item.href}
                    tooltip={item.title}
                    className="h-8 gap-2.5 text-[13.5px] text-sidebar-foreground data-[active=true]:text-foreground [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-brand-ink"
                  >
                    <Link href={client ? portalHref(item.href, client, clients) : item.href} onClick={closeOnMobile}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && counts[item.badge] > 0 ? (
                    <SidebarMenuBadge
                      aria-label={
                        item.badge === "messages"
                          ? `${counts.messages} ${counts.messages === 1 ? "mensagem não lida" : "mensagens não lidas"}`
                          : `${counts.notifications} ${counts.notifications === 1 ? "aviso não lido" : "avisos não lidos"}`
                      }
                      className="rounded-full bg-brand px-1.5 text-[11px] text-brand-navy peer-data-[active=true]/menu-button:text-brand-navy"
                    >
                      {countLabel(counts[item.badge])}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <PortalUserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** A marca do portal e, embaixo, o cliente (ou a dica de trocar). */
function Brand({ subtitle }: { subtitle: string | null }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center">
        <BoopMark className="w-[30px]" />
      </span>
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">Boop</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </>
  )
}

/**
 * Troca de cliente para quem acompanha mais de um: leva à mesma tela do outro
 * cliente; de um post ou projeto aberto, à seção dele (o item é do cliente
 * anterior).
 */
function ClientSwitcher({
  client,
  clients,
  pathname,
  onNavigate,
}: {
  client: PortalClient
  clients: readonly PortalClient[]
  pathname: string
  onNavigate: () => void
}) {
  const { isMobile } = useSidebar()
  const target = isPortalDetail(pathname) ? (portalSectionOf(pathname)?.href ?? "/portal") : pathname

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Brand subtitle={client.name} />
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
        side={isMobile ? "bottom" : "right"}
        align="start"
        sideOffset={6}
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Clientes</DropdownMenuLabel>
        {clients.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={portalHref(target, item, clients)} onClick={onNavigate}>
              <span className={cn("min-w-0 flex-1 truncate", item.id === client.id && "font-medium")}>{item.name}</span>
              {item.id === client.id ? <Check className="text-brand-ink" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Quem está logado no portal (o nome dado pela equipe e o e-mail) e "Sair". */
function PortalUserMenu({ user }: { user: { name: string; email: string } }) {
  const { isMobile } = useSidebar()
  const [isSigningOut, startSignOut] = useTransition()
  const initial = user.name.trim().charAt(0).toUpperCase() || "?"

  const avatar = (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
    >
      {initial}
    </span>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="h-11 gap-2.5 data-[state=open]:bg-sidebar-accent">
              {avatar}
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "top"}
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
              {avatar}
              <div className="grid flex-1 leading-tight">
                <span className="truncate text-[13px] font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isSigningOut} onSelect={() => startSignOut(() => signOut())}>
              <LogOut />
              {isSigningOut ? "Saindo…" : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
