import "server-only"

import { parseCommunicationInput } from "@/features/communications/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Gravações das comunicações com clientes (Server Actions e conector do Claude). */

export async function insertCommunication(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseCommunicationInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("communications").insert(parsed.value).select("id").single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse cliente não existe mais." }
    return dbFailure(error, "Não foi possível registrar.")
  }
  return { ok: true, data: { id: data.id } }
}
