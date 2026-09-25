import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BoopMark } from "@/components/layout/boop-mark"
import { Card } from "@/components/ui/card"
import { LoginForm } from "@/features/auth/login-form"
import { getSessionUser } from "@/features/auth/session"

export const metadata: Metadata = { title: "Entrar" }

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/hoje")

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-5 text-center">
          <BoopMark className="w-14" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold tracking-tight">Entrar no Boop Admin</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito à equipe da Boop.</p>
          </div>
        </div>
        <Card className="p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <LoginForm />
        </Card>
      </div>
    </main>
  )
}
