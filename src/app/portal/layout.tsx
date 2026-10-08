import type { ReactNode } from "react"

import { BoopMark } from "@/components/layout/boop-mark"
import { Button } from "@/components/ui/button"
import { signOut } from "@/features/auth/actions"
import { requirePortalUser } from "@/features/portal/session"

/**
 * Área do cliente: layout próprio, sem a barra lateral da equipe. Só contas
 * com acesso de cliente entram; a equipe usa o admin.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requirePortalUser()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <BoopMark className="w-7" />
          <span className="font-display text-sm font-semibold tracking-tight">Boop</span>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-[13px] text-muted-foreground sm:block">{user.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="h-8 px-2.5 text-[13px]">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-16">{children}</main>
    </div>
  )
}
