import "server-only"

import { parseKeyResultInput, parseKeyResultPatch, parseObjectiveInput, parseObjectivePatch } from "@/features/goals/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Gravações das metas (objetivos e resultados-chave), usadas pelas Server Actions e pelo conector do Claude. */

const OBJECTIVE_NOT_FOUND = { ok: false, error: "Esse objetivo não existe mais." } as const
const KEY_RESULT_NOT_FOUND = { ok: false, error: "Esse resultado-chave não existe mais." } as const

export async function insertObjective(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseObjectiveInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("objectives").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o objetivo.")
  return { ok: true, data: { id: data.id } }
}

export async function patchObjective(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return OBJECTIVE_NOT_FOUND
  const parsed = parseObjectivePatch(patch)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("objectives").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "O fim não pode ser antes do começo." }
    return dbFailure(error, "Não foi possível salvar o objetivo.")
  }
  if (data.length === 0) return OBJECTIVE_NOT_FOUND
  return { ok: true, data: null }
}

export async function removeObjective(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return OBJECTIVE_NOT_FOUND
  const { data, error } = await supabase.from("objectives").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o objetivo.")
  if (data.length === 0) return OBJECTIVE_NOT_FOUND
  return { ok: true, data: null }
}

export async function insertKeyResult(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseKeyResultInput(input)
  if (!parsed.ok) return parsed
  // Vai para o fim da lista do objetivo.
  const { count, error: countError } = await supabase
    .from("key_results")
    .select("id", { count: "exact", head: true })
    .eq("objective_id", parsed.value.objective_id)
  if (countError) return dbFailure(countError, "Não foi possível criar o resultado-chave.")
  const { data, error } = await supabase
    .from("key_results")
    .insert({ ...parsed.value, position: Math.min(count ?? 0, 32000) })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23503") return OBJECTIVE_NOT_FOUND
    return dbFailure(error, "Não foi possível criar o resultado-chave.")
  }
  return { ok: true, data: { id: data.id } }
}

export async function patchKeyResult(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return KEY_RESULT_NOT_FOUND
  const parsed = parseKeyResultPatch(patch)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("key_results").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o resultado-chave.")
  if (data.length === 0) return KEY_RESULT_NOT_FOUND
  return { ok: true, data: null }
}

export async function removeKeyResult(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return KEY_RESULT_NOT_FOUND
  const { data, error } = await supabase.from("key_results").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o resultado-chave.")
  if (data.length === 0) return KEY_RESULT_NOT_FOUND
  return { ok: true, data: null }
}

