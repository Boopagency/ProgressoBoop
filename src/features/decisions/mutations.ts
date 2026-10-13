import "server-only"

import { parseDecisionInput, parseDecisionPatch } from "@/features/decisions/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Gravações das decisões (Server Actions e conector do Claude). Histórico e autoria ficam com o banco. */

const NOT_FOUND = { ok: false, error: "Essa decisão não existe mais." } as const

export async function insertDecision(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseDecisionInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("decisions").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível registrar a decisão.")
  return { ok: true, data: { id: data.id } }
}

export async function patchDecision(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseDecisionPatch(patch)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("decisions").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar a decisão.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

export async function removeDecision(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const { data, error } = await supabase.from("decisions").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a decisão.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}
