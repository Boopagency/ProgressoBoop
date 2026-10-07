"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  parseDealInput,
  parseDealPatch,
  parseWinInput,
  type DealInput,
  type DealPatch,
  type WinInput,
} from "@/features/deals/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions do comercial. Ganhar um negócio passa pela função win_deal
 * do banco: cliente, contrato, entrada e projeto nascem na mesma transação.
 */

const NOT_FOUND = { ok: false, error: "Esse negócio não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createDeal(input: DealInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseDealInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("deals").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o negócio.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

/** Edita o negócio (inclusive mover de etapa, perder ou reabrir). Ganhar é com winDeal. */
export async function updateDeal(id: string, patch: DealPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseDealPatch(patch)
  if (!parsed.ok) return parsed
  if (parsed.value.stage === "won") return { ok: false, error: "Para ganhar, use “Marcar como ganho”." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("deals").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o negócio.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteDeal(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("deals").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o negócio.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
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
export async function winDeal(id: string, input: WinInput): Promise<ActionResult<WinResult>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseWinInput(input)
  if (!parsed.ok) return parsed
  const options = parsed.value
  const supabase = await createClient()
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
  refreshApp()
  return { ok: true, data: data as unknown as WinResult }
}
