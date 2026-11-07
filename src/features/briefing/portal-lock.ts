import "server-only"

import type { SupabaseServerClient } from "@/lib/supabase/server"

/**
 * Clientes da conta logada (portal) com o briefing liberado e não enviado.
 * Pelo RLS, a conta só lê o briefing dos próprios clientes. Se a consulta
 * falhar (ou antes da migration entrar no banco), ninguém fica travado: o
 * banco ainda recusa as aprovações (`briefing_pending`).
 */
export async function fetchLockedBriefingClients(supabase: SupabaseServerClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("client_briefings").select("client_id").in("status", ["not_started", "in_progress"])
  if (error) {
    console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    return new Set()
  }
  return new Set(data.map((row) => row.client_id))
}
