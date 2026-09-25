"use client"

import { ChevronsUpDown, LogOut } from "lucide-react"
import { useTransition } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { signOut } from "@/features/auth/actions"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"

export function NavUser() {
  const { currentUser, profiles } = useWorkspace()
  const { isMobile } = useSidebar()
  const [isSigningOut, startSignOut] = useTransition()
  const colorIndex = profiles.findIndex((profile) => profile.id === currentUser.id)

  const avatar = (
    <PersonAvatar
      name={currentUser.full_name}
      avatarUrl={currentUser.avatar_url}
      colorIndex={colorIndex}
      size="sm"
      className="size-7"
    />
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-11 gap-2.5 data-[state=open]:bg-sidebar-accent"
            >
              {avatar}
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {currentUser.full_name}
                </span>
                <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
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
                <span className="truncate text-[13px] font-medium">{currentUser.full_name}</span>
                <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isSigningOut}
              onSelect={() => startSignOut(() => signOut())}
            >
              <LogOut />
              {isSigningOut ? "Saindo…" : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
