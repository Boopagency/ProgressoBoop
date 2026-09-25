"use client"

import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AppTopbar() {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((item) => isActivePath(pathname, item.href))

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-sm md:px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      {current ? (
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <current.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {current.title}
        </span>
      ) : null}
    </header>
  )
}
