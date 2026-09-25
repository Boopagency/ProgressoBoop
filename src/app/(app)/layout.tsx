import { cookies } from "next/headers"
import type { ReactNode } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppTopbar } from "@/components/layout/app-topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { requireUser } from "@/features/auth/session"
import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { getWorkspace } from "@/features/workspace/queries"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, workspace, cookieStore] = await Promise.all([
    requireUser(),
    getWorkspace(),
    cookies(),
  ])
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <WorkspaceProvider workspace={workspace} currentUser={user}>
      <NewTaskProvider>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar />
          <SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/80 md:peer-data-[variant=inset]:shadow-[0_1px_3px_0_rgb(0_0_0/0.03)]">
            <AppTopbar />
            <div className="flex-1 md:overflow-y-auto">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </NewTaskProvider>
    </WorkspaceProvider>
  )
}
