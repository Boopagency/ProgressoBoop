"use client"

import { Check, ChevronsUpDown, LogOut, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { BoopMark } from "@/components/layout/boop-mark"
import { ThemeMenuItems } from "@/components/layout/theme-menu"
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
import { AccountDialog, type AccountDialogUser } from "@/features/account/account-dialog"
import { signOut } from "@/features/auth/actions"
import { portalHref, selectedClient } from "@/features/portal/links"
import { countLabel } from "@/features/portal/notification-logic"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import { isPortalDetail, PORTAL_NAV, portalSectionOf } from "@/features/portal/portal-nav"
import type { PortalClient } from "@/features/portal/session"
import { forgetThisDevice } from "@/features/push/browser"
import { PersonAvatar } from "@/features/workspace/person-avatar"
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
  user: AccountDialogUser
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
                    className="h-9 gap-2.5 rounded-full px-3 text-[13.5px] text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-[0_6px_16px_-8px_rgb(11_27_44/0.5)] data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-(--sidebar-primary-icon)"
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
                      className="right-2 rounded-full bg-brand px-1.5 text-[11px] text-brand-navy peer-data-[size=default]/menu-button:top-2 peer-data-[active=true]/menu-button:text-brand-navy"
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

/** Quem está logado no portal (nome, foto e e-mail), Minha conta, o tema e "Sair". */
function PortalUserMenu({ user }: { user: AccountDialogUser }) {
  const { isMobile } = useSidebar()
  const [isSigningOut, startSignOut] = useTransition()
  const [accountOpen, setAccountOpen] = useState(false)

  const avatar = (
    <PersonAvatar name={user.name} avatarUrl={user.avatarUrl} colorIndex={0} size="sm" className="size-7" />
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
            <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
              <UserRound />
              Minha conta
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isSigningOut}
              onSelect={() =>
                startSignOut(async () => {
                  await forgetThisDevice()
                  await signOut()
                })
              }
            >
              <LogOut />
              {isSigningOut ? "Saindo…" : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} user={user} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
