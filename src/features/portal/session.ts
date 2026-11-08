import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { avatarPublicUrl } from "@/features/account/logic"
import { fetchLockedBriefingClients } from "@/features/briefing/portal-lock"
import { supabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

/** Um cliente que a conta do portal acompanha. */
export interface PortalClient {
  id: string
  name: string
  /**
   * Briefing liberado e ainda não enviado: o portal deste cliente só mostra o
   * Briefing (as outras telas levam a `/portal/briefing`).
   */
  briefingLocked?: boolean
}

/** Pessoa de um cliente logada no portal (conta sem perfil da equipe). */
export interface PortalUser {
  id: string
  email: string
  /** Nome dado pela equipe ao liberar o acesso (ex.: "Barbara"). */
  name: string
  /** Foto escolhida pela pessoa em Minha conta. */
  avatarUrl: string | null
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

  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase.rpc("portal_my_clients"),
    // A foto é só um detalhe: se não vier, o portal mostra a inicial.
    supabase.from("client_members").select("avatar_path").eq("user_id", data.claims.sub).limit(1).maybeSingle(),
  ])
  const first = rows?.[0]
  if (!rows || !first) return null
  const locked = await fetchLockedBriefingClients(supabase)

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    name: first.member_name,
    avatarUrl: me?.avatar_path ? avatarPublicUrl(supabaseEnv().url, me.avatar_path) : null,
    clients: rows.map((row) => ({ id: row.client_id, name: row.client_name, briefingLocked: locked.has(row.client_id) })),
  }
})

/** Garante uma conta de cliente nas telas do portal. Sem ela, vai para o login. */
export async function requirePortalUser(): Promise<PortalUser> {
  const user = await getPortalUser()
  if (!user) redirect("/login")
  return user
}

/**
 * Cliente escolhido em `?cliente=` (precisa ser da conta); senão, o primeiro.
 * Com o briefing desse cliente liberado e não enviado, a tela não abre: vai
 * para o Briefing.
 */
export function pickPortalClient(user: PortalUser, requested: unknown): PortalClient {
  return requireUnlockedClient(user, pickPortalClientForBriefing(user, requested))
}

/** O mesmo cliente de `pickPortalClient`, sem o desvio para o Briefing (a própria tela do Briefing). */
export function pickPortalClientForBriefing(user: PortalUser, requested: unknown): PortalClient {
  const client = user.clients.find((item) => item.id === requested) ?? user.clients[0]
  // `clients` nunca vem vazio (getPortalUser devolve null nesse caso).
  if (!client) redirect("/login")
  return client
}

/** Cliente com o briefing pendente: leva ao Briefing dele. */
export function requireUnlockedClient(user: PortalUser, client: PortalClient): PortalClient {
  if (client.briefingLocked) {
    redirect(user.clients.length > 1 ? `/portal/briefing?cliente=${client.id}` : "/portal/briefing")
  }
  return client
}
