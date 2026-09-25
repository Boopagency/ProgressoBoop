import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { SessionUser } from "@/lib/types"

/**
 * Usuário da requisição atual: sessão válida no Supabase Auth (JWT
 * verificado por getClaims) e perfil em `profiles`. Sem perfil, a conta não
 * é da equipe e é tratada como deslogada.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", data.claims.sub)
    .maybeSingle()
  if (!profile) return null

  return {
    id: profile.id,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
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
