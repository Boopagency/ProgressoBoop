import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

/** Um cliente que a conta do portal acompanha. */
export interface PortalClient {
  id: string
  name: string
}

/** Pessoa de um cliente logada no portal (conta sem perfil da equipe). */
export interface PortalUser {
  id: string
  email: string
  /** Nome dado pela equipe ao liberar o acesso (ex.: "Barbara"). */
  name: string
  /** Clientes ativos da conta, em ordem alfabética. Nunca vazio. */
  clients: PortalClient[]
}

/**
 * Conta de cliente da requisição atual: sessão válida no Supabase Auth e pelo
 * menos um cliente ativo em `client_members`. Lê só por `portal_my_clients`,
 * que devolve o mínimo (o portal não lê as tabelas da equipe).
 */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { data: rows } = await supabase.rpc("portal_my_clients")
  const first = rows?.[0]
  if (!rows || !first) return null

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    name: first.member_name,
    clients: rows.map((row) => ({ id: row.client_id, name: row.client_name })),
  }
})

/** Garante uma conta de cliente nas telas do portal. Sem ela, vai para o login. */
export async function requirePortalUser(): Promise<PortalUser> {
  const user = await getPortalUser()
  if (!user) redirect("/login")
  return user
}

/** Cliente escolhido em `?cliente=` (precisa ser da conta); senão, o primeiro. */
export function pickPortalClient(user: PortalUser, requested: unknown): PortalClient {
  const client = user.clients.find((item) => item.id === requested) ?? user.clients[0]
  // `clients` nunca vem vazio (getPortalUser devolve null nesse caso).
  if (!client) redirect("/login")
  return client
}
