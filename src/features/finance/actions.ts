"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  closeMonthWith,
  insertEntry,
  insertRecurrence,
  patchEntry,
  patchOccurrence,
  patchRecurrence,
  removeEntry,
  removeRecurrence,
  reopenMonthWith,
} from "@/features/finance/mutations"
import {
  parseSettingsPatch,
  type ClosingInput,
  type EntryInput,
  type EntryPatch,
  type RecurrenceInput,
  type RecurrencePatch,
  type SettingsPatch,
} from "@/features/finance/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions do financeiro: a sessão e a tela; a regra fica em mutations.ts. */

function refreshApp() {
  revalidatePath("/", "layout")
}

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) refreshApp()
  return result
}

export async function createEntry(input: EntryInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertEntry(await createClient(), input))
}

export async function updateEntry(id: string, patch: EntryPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchEntry(await createClient(), id, patch))
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeEntry(await createClient(), id))
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
  return refreshed(await patchOccurrence(await createClient(), recurrenceId, period, patch))
}

export async function createRecurrence(input: RecurrenceInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertRecurrence(await createClient(), input))
}

/** Muda a recorrência: vale para os meses ainda não gravados (os gravados ficam como estão). */
export async function updateRecurrence(id: string, patch: RecurrencePatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchRecurrence(await createClient(), id, patch))
}

/** Apaga a recorrência. Os meses já gravados (pagos, por exemplo) continuam no histórico. */
export async function deleteRecurrence(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeRecurrence(await createClient(), id))
}

/* ------------------------------------------------------------------ */
/* Parâmetros e fechamento do mês                                      */
/* ------------------------------------------------------------------ */

/** Premissas do financeiro (alíquota, caixa mínimo, divisão, sócios, saldo inicial). */
export async function updateFinanceSettings(patch: SettingsPatch): Promise<ActionResult> {
  await requireUser()
  const parsed = parseSettingsPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("finance_settings").update(parsed.value).eq("id", true).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Caixa + reinvestimento não podem passar de 100%." }
    return dbFailure(error, "Não foi possível salvar os parâmetros.")
  }
  if (data.length === 0) return { ok: false, error: "Os parâmetros do financeiro não foram encontrados." }
  refreshApp()
  return { ok: true, data: null }
}

/** Fecha um mês já encerrado (regra em mutations.ts). */
export async function closeMonth(input: ClosingInput): Promise<ActionResult<{ ledger_balance_cents: number }>> {
  await requireUser()
  return refreshed(await closeMonthWith(await createClient(), input))
}

/** Reabre um mês fechado (os pagamentos dele voltam a poder mudar). */
export async function reopenMonth(period: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await reopenMonthWith(await createClient(), period))
}
