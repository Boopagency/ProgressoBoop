import "server-only"

import { parseEventInput } from "@/features/calendar/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações dos eventos (Server Actions e conector do Claude). Eventos
 * recorrentes são editados e excluídos como série (todas as ocorrências).
 */

const NOT_FOUND = { ok: false, error: "Esse evento não existe mais." } as const

export async function insertEvent(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("events").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o evento.")
  return { ok: true, data: { id: data.id } }
}

export async function patchEvent(supabase: SupabaseServerClient, id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("events").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o evento.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

export async function removeEvent(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const { data, error } = await supabase.from("events").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o evento.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}
