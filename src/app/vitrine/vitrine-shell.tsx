"use client"

import { Bell, Menu } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { BoopMark } from "@/components/layout/boop-mark"
import { NAV_GROUPS, NAV_ITEMS } from "@/components/layout/nav-items"
import { NAV_ITEM_CLASS, TOPBAR_CLASS, TOPBAR_SECTION_CLASS, TOPBAR_TRIGGER_CLASS } from "@/components/layout/shell-classes"
import { TabBar, TabBarItem } from "@/components/layout/tab-bar"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { PORTAL_NAV } from "@/features/portal/portal-nav"
import { CommandPaletteProvider, SearchButton } from "@/features/search/command-palette"

/*
 * Casca da vitrine: o mesmo menu lateral, topo e menu de baixo do admin e do
 * portal, com as mesmas classes (`shell-classes.ts`), mas sem os provedores
 * que consultam o servidor (não lidas, sino, alertas do portal). Só para ver
 * o visual com dados de exemplo.
 */
export function VitrineShell({ area, active, children }: { area: "admin" | "portal"; active: string; children: ReactNode }) {
  const groups = area === "admin" ? NAV_GROUPS : [{ label: null, items: PORTAL_NAV }]
  const current = (area === "admin" ? NAV_ITEMS : PORTAL_NAV).find((item) => item.href === active)
  const tabs = area === "admin" ? NAV_ITEMS.filter((item) => ["/hoje", "/tarefas", "/conteudo", "/comunicacoes"].includes(item.href)) : PORTAL_NAV.filter((item) => ["/portal", "/portal/calendario", "/portal/comunicacao", "/portal/notificacoes"].includes(item.href))

  return (
    <CommandPaletteProvider>
      <SidebarProvider className="max-md:[--app-bottom-bar:calc(3.5rem+env(safe-area-inset-bottom))]">
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader className="pt-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
                  <Link href="#">
                    <span className="flex size-8 shrink-0 items-center justify-center">
                      <BoopMark className="w-[30px]" />
                    </span>
                    <span className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                        {area === "admin" ? "Boop Admin" : "Boop"}
                      </span>
                      {area === "portal" ? <span className="truncate text-xs text-muted-foreground">Café Aurora</span> : null}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="gap-0">
            {groups.map((group) => (
              <SidebarGroup key={group.label ?? "principal"} className="py-1.5">
                {group.label ? (
                  <SidebarGroupLabel className="h-7 eyebrow text-[10.5px] text-subtle-foreground">{group.label}</SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={item.href === active} tooltip={item.title} className={NAV_ITEM_CLASS}>
                          <Link href="#">
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden">
          <header className={TOPBAR_CLASS}>
            <SidebarTrigger className={TOPBAR_TRIGGER_CLASS} />
            {current ? (
              <span className={TOPBAR_SECTION_CLASS}>
                <current.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {current.title}
              </span>
            ) : null}
            {area === "admin" ? (
              <>
                <SearchButton className="ml-auto" />
                <button
                  type="button"
                  aria-label="Notificações"
                  className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground md:size-9 md:border md:border-glass-edge md:bg-card md:shadow-[inset_0_1px_0_var(--glass-highlight)]"
                >
                  <Bell className="size-4" aria-hidden="true" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-navy ring-2 ring-background">
                    3
                  </span>
                </button>
              </>
            ) : null}
          </header>
          <div className={`flex-1 max-md:pb-(--app-bottom-bar) md:overflow-y-auto md:[scrollbar-gutter:stable] ${area === "portal" ? "portal-motion" : ""}`}>
            {children}
          </div>
        </SidebarInset>
        <TabBar label="Menu">
          {tabs.map((item) => (
            <TabBarItem key={item.href} href="#" title={item.href === "/portal/calendario" ? "Conteúdo" : item.title} icon={item.icon} active={item.href === active} count={item.href === "/comunicacoes" || item.href === "/portal/comunicacao" ? 2 : 0} />
          ))}
          <TabBarItem title="Mais" icon={Menu} />
        </TabBar>
      </SidebarProvider>
    </CommandPaletteProvider>
  )
}
