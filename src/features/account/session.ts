import "server-only"

import { redirect } from "next/navigation"

import { getSessionUser } from "@/features/auth/session"
import { getPortalUser } from "@/features/portal/session"

/** Quem está logado, da equipe (perfil) ou de um cliente (portal). */
export interface AccountUser {
  kind: "team" | "client"
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

/** Garante uma conta logada nas actions de Minha conta. Sem ela, vai para o login. */
export async function requireAccount(): Promise<AccountUser> {
  const team = await getSessionUser()
  if (team) {
    return { kind: "team", id: team.id, email: team.email, name: team.full_name, avatarUrl: team.avatar_url }
  }
  const client = await getPortalUser()
  if (client) {
    return { kind: "client", id: client.id, email: client.email, name: client.name, avatarUrl: client.avatarUrl }
  }
  redirect("/login")
}
