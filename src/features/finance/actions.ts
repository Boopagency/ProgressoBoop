"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { isPeriod } from "@/features/clients/validation"
import { occurrenceDue } from "@/features/finance/logic"
import {
  parseEntryInput,
  parseEntryPatch,
  parseRecurrenceInput,
  parseRecurrencePatch,
  type EntryInput,
  type EntryPatch,
  type RecurrenceInput,
  type RecurrencePatch,
} from "@/features/finance/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions do financeiro. Uma ocorrência de recorrência só vira registro
 * quando alguém mexe nela (ensureOccurrence), como as revisões de clientes.
 */

const ENTRY_NOT_FOUND = { ok: false, error: "Esse lançamento não existe mais." } as const
const RECURRENCE_NOT_FOUND = { ok: false, error: "Essa recorrência não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createEntry(input: EntryInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseEntryInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_entries").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível lançar.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateEntry(id: string, patch: EntryPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return ENTRY_NOT_FOUND
  const parsed = parseEntryPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_entries").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o lançamento.")
  if (data.length === 0) return ENTRY_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return ENTRY_NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_entries").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o lançamento.")
  if (data.length === 0) return ENTRY_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** Lançamento do mês de uma recorrência; gravado (com os valores dela) na primeira mudança. */
async function ensureOccurrence(
  supabase: SupabaseServerClient,
  recurrenceId: string,
  period: string
): Promise<ActionResult<{ id: string }>> {
  const { data: existing, error } = await supabase
    .from("finance_entries")
    .select("id")
    .eq("recurrence_id", recurrenceId)
    .eq("period", period)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir o lançamento do mês.")
  if (existing) return { ok: true, data: { id: existing.id } }

  const { data: recurrence, error: readError } = await supabase
    .from("finance_recurrences")
    .select("kind, description, amount_cents, day_of_month, category, client_id, project_id, starts_on, ends_on")
    .eq("id", recurrenceId)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível abrir o lançamento do mês.")
  if (!recurrence) return RECURRENCE_NOT_FOUND
  if (period < recurrence.starts_on || (recurrence.ends_on && period > recurrence.ends_on)) {
    return { ok: false, error: "Esse mês está fora da recorrência." }
  }

  const { data: created, error: insertError } = await supabase
    .from("finance_entries")
    .insert({
      kind: recurrence.kind,
      description: recurrence.description,
      amount_cents: recurrence.amount_cents,
      due_on: occurrenceDue(recurrence, period),
      category: recurrence.category,
      client_id: recurrence.client_id,
      project_id: recurrence.project_id,
      recurrence_id: recurrenceId,
      period,
    })
    .select("id")
    .single()
  if (insertError) {
    // Outra pessoa abriu o mesmo mês no mesmo instante: usa o dela.
    if (insertError.code === "23505") return ensureOccurrence(supabase, recurrenceId, period)
    return dbFailure(insertError, "Não foi possível abrir o lançamento do mês.")
  }
  return { ok: true, data: { id: created.id } }
}

/**
 * Altera o mês de uma recorrência (pago, pulado, valor ou vencimento só
 * deste mês). Grava a ocorrência se ela ainda não existe.
 */
export async function updateOccurrence(
  recurrenceId: string,
  period: string,
  patch: EntryPatch
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(recurrenceId) || !isPeriod(period)) return RECURRENCE_NOT_FOUND
  const parsed = parseEntryPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const occurrence = await ensureOccurrence(supabase, recurrenceId, period)
  if (!occurrence.ok) return occurrence
  if (Object.keys(parsed.value).length > 0) {
    const { error } = await supabase.from("finance_entries").update(parsed.value).eq("id", occurrence.data.id)
    if (error) return dbFailure(error, "Não foi possível salvar o lançamento.")
  }
  refreshApp()
  return occurrence
}

export async function createRecurrence(input: RecurrenceInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseRecurrenceInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_recurrences").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a recorrência.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

/** Muda a recorrência: vale para os meses ainda não gravados (os gravados ficam como estão). */
export async function updateRecurrence(id: string, patch: RecurrencePatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return RECURRENCE_NOT_FOUND
  const parsed = parseRecurrencePatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_recurrences").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "O fim não pode ser antes do começo." }
    return dbFailure(error, "Não foi possível salvar a recorrência.")
  }
  if (data.length === 0) return RECURRENCE_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** Apaga a recorrência. Os meses já gravados (pagos, por exemplo) continuam no histórico. */
export async function deleteRecurrence(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return RECURRENCE_NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_recurrences").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a recorrência.")
  if (data.length === 0) return RECURRENCE_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}
