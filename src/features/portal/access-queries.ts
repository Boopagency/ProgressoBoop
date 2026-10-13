import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/** Pessoa de um cliente com acesso ao portal (visão da equipe). */
export interface ClientMember {
  id: string
  full_name: string
  email: string
  created_at: string
}

/** Quem do cliente tem acesso ao portal, na ordem em que foi liberado. */
export async function getClientMembers(clientId: string): Promise<ClientMember[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_members")
    .select("id, full_name, email, created_at")
    .eq("client_id", clientId)
    .order("created_at")
  if (error) throw loadError(error, "os acessos do cliente")
  return data
}

/** Nomes das contas de cliente (por `user_id`), para mostrar quem respondeu uma etapa. */
export async function getClientMemberNames(userIds: string[]): Promise<Map<string, string>> {
  await requireUser()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  const supabase = await createClient()
  const { data, error } = await supabase.from("client_members").select("user_id, full_name").in("user_id", ids)
  if (error) throw loadError(error, "os acessos do cliente")
  return new Map(data.map((row) => [row.user_id, row.full_name]))
}
