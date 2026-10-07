"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { BoopMark } from "@/components/layout/boop-mark"
import { isActivePath, NAV_GROUPS } from "@/components/layout/nav-items"
import { NavUser } from "@/components/layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { sameQuery } from "@/features/tasks/filters"
import { useWorkspace } from "@/features/workspace/workspace-provider"

export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { savedViews } = useWorkspace()
  const { isMobile, setOpenMobile } = useSidebar()

  // No celular a sidebar é um Sheet: fecha ao navegar.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const onTasks = pathname === "/tarefas"
  const currentQuery = onTasks ? searchParams.toString() : ""

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
              <Link href="/hoje" onClick={closeOnMobile}>
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <BoopMark className="w-[30px]" />
                </span>
                <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                  Boop Admin
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? "principal"} className="py-1.5">
            {group.label ? (
              <SidebarGroupLabel className="h-7 text-[11px] tracking-wide text-subtle-foreground uppercase">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, item.href) && !(item.href === "/tarefas" && savedViews.some((view) => sameQuery(view.query, currentQuery) && currentQuery !== ""))}
                      tooltip={item.title}
                      className="h-8 gap-2.5 text-[13.5px] text-sidebar-foreground data-[active=true]:text-foreground [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-brand-ink"
                    >
                      <Link href={item.href} onClick={closeOnMobile}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.href === "/tarefas" && savedViews.length > 0 ? (
                      <SidebarMenuSub className="mr-0 pr-0">
                        {savedViews.slice(0, 8).map((view) => (
                          <SidebarMenuSubItem key={view.id}>
                            <SidebarMenuSubButton
                              asChild
                              size="sm"
                              isActive={onTasks && currentQuery !== "" && sameQuery(view.query, currentQuery)}
                              className="text-[13px] text-muted-foreground data-[active=true]:text-foreground"
                            >
                              <Link href={view.query ? `/tarefas?${view.query}` : "/tarefas"} onClick={closeOnMobile}>
                                <span className="truncate">{view.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
