import { cookies } from "next/headers"
import type { ReactNode } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppTabBar } from "@/components/layout/app-tab-bar"
import { AppTopbar } from "@/components/layout/app-topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { requireUser } from "@/features/auth/session"
import { getChannelTotals } from "@/features/channels/queries"
import { UnreadProvider } from "@/features/channels/unread-provider"
import { getNotifications } from "@/features/notifications/queries"
import { PushRefresh } from "@/features/push/push-refresh"
import { CommandPaletteProvider } from "@/features/search/command-palette"
import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { getWorkspace } from "@/features/workspace/queries"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, workspace, cookieStore, channelTotals, notifications] = await Promise.all([
    requireUser(),
    getWorkspace(),
    cookies(),
    getChannelTotals(),
    getNotifications(),
  ])
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <WorkspaceProvider workspace={workspace} currentUser={user}>
      <NewTaskProvider>
        <CommandPaletteProvider>
        <UnreadProvider initial={channelTotals}>
        {/* No celular, o menu fica embaixo (AppTabBar); --app-bottom-bar é a altura dele. */}
        <SidebarProvider defaultOpen={sidebarOpen} className="max-md:[--app-bottom-bar:calc(3.5rem+env(safe-area-inset-bottom))]">
          <AppSidebar />
          <SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden bg-canvas md:peer-data-[variant=inset]:rounded-[1.375rem] md:peer-data-[variant=inset]:shadow-none">
            <AppTopbar notifications={notifications} />
            <div className="flex-1 max-md:pb-(--app-bottom-bar) md:overflow-y-auto">{children}</div>
          </SidebarInset>
          <AppTabBar />
          <PushRefresh />
        </SidebarProvider>
        </UnreadProvider>
        </CommandPaletteProvider>
      </NewTaskProvider>
    </WorkspaceProvider>
  )
}
