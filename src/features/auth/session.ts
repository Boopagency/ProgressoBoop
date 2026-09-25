import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { SESSION_COOKIE } from "@/features/auth/constants"
import type { SessionUser } from "@/lib/types"
import { mockDb } from "@/server/mock/db"

/**
 * Usuário da requisição atual. Etapa 1: cookie simulado. Etapa 2:
 * `supabase.auth.getUser()` + perfil em `profiles`.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const userId = (await cookies()).get(SESSION_COOKIE)?.value
  if (!userId) return null

  const db = mockDb()
  const user = db.users.find((candidate) => candidate.id === userId)
  const profile = db.profiles.find((candidate) => candidate.id === userId)
  if (!user || !profile) return null

  return {
    id: profile.id,
    email: user.email,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
  }
})

/** Garante sessão em páginas, queries e actions. Sem sessão, vai para o login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return user
}
