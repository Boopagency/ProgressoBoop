import "server-only"

import { parseDealInput, parseDealPatch, parseWinInput } from "@/features/deals/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações do comercial, usadas pelas Server Actions e pelo conector do
 * Claude (mesma validação, mesmo RLS). Ganhar um negócio passa pela função
 * win_deal do banco: cliente, contrato, entrada e projeto nascem na mesma
 * transação.
 */

const NOT_FOUND = { ok: false, error: "Esse negócio não existe mais." } as const

export async function insertDeal(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseDealInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("deals").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o negócio.")
  return { ok: true, data: { id: data.id } }
}

/** Edita o negócio (inclusive mover de etapa, perder ou reabrir). Ganhar é com markDealWon. */
export async function patchDeal(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseDealPatch(patch)
  if (!parsed.ok) return parsed
  if (parsed.value.stage === "won") return { ok: false, error: "Para ganhar, use “Marcar como ganho”." }
  const { data, error } = await supabase.from("deals").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o negócio.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

export async function removeDeal(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const { data, error } = await supabase.from("deals").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o negócio.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

export interface WinResult {
  client_id: string
  client_created: boolean
  project_id: string | null
  recurrence_id: string | null
  entry_id: string | null
}

const WIN_ERRORS: Record<string, string> = {
  deal_not_found: "Esse negócio não existe mais.",
  deal_closed: "Esse negócio já foi fechado. Reabra antes de ganhar de novo.",
  client_not_found: "Esse cliente não existe mais.",
  invalid_client: "Informe o nome do cliente (até 120 letras).",
  invalid_contract: "Confira o dia e o mês de início do contrato.",
}

/** Marca como ganho e cria cliente, contrato, entrada e projeto (o que foi pedido). */
export async function markDealWon(supabase: SupabaseServerClient, id: string, input: unknown): Promise<ActionResult<WinResult>> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseWinInput(input)
  if (!parsed.ok) return parsed
  const options = parsed.value
  const { data, error } = await supabase.rpc("win_deal", {
    deal_id: id,
    client_id: options.client_id ?? undefined,
    client_name: options.client_name ?? undefined,
    contract_day: options.contract_day ?? undefined,
    contract_starts_on: options.contract_starts_on ?? undefined,
    contract_months: options.contract_months ?? undefined,
    one_time_due_on: options.one_time_due_on ?? undefined,
    project_name: options.project_name ?? undefined,
  })
  if (error) {
    const known = WIN_ERRORS[error.message]
    if (known) return { ok: false, error: known }
    if (error.code === "23505") return { ok: false, error: "Já existe um cliente com esse nome." }
    return dbFailure(error, "Não foi possível marcar como ganho.")
  }
  return { ok: true, data: data as unknown as WinResult }
}
