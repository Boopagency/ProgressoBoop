import "server-only"

import { addPeriods, periodLabel } from "@/features/clients/logic"
import { isPeriod } from "@/features/clients/validation"
import { occurrenceDue } from "@/features/finance/logic"
import { indexFinance, ledgerBalance } from "@/features/finance/management"
import { fetchFinance } from "@/features/finance/queries"
import {
  parseClosingInput,
  parseEntryInput,
  parseEntryPatch,
  parseRecurrenceInput,
  parseRecurrencePatch,
} from "@/features/finance/validation"
import { monthRangeOf, todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações do financeiro, usadas pelas Server Actions e pelo conector do
 * Claude (mesma validação, mesmo RLS, mesma trava do mês fechado). Uma
 * ocorrência de recorrência só vira registro quando alguém mexe nela
 * (ensureOccurrence), como as revisões de clientes.
 */

export const ENTRY_NOT_FOUND = { ok: false, error: "Esse lançamento não existe mais." } as const
const RECURRENCE_NOT_FOUND = { ok: false, error: "Essa recorrência não existe mais." } as const
const ACCOUNT_MISMATCH = { ok: false, error: "Essa categoria não combina com o tipo (receita ou despesa)." } as const

/** A categoria não combina com receita/despesa (check do banco). */
function isAccountMismatch(error: { code?: string; message: string }): boolean {
  return error.code === "23514" && error.message.includes("account_check")
}

export async function insertEntry(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseEntryInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("finance_entries").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível lançar.")
  return { ok: true, data: { id: data.id } }
}

export async function patchEntry(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return ENTRY_NOT_FOUND
  const parsed = parseEntryPatch(patch)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("finance_entries").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (isAccountMismatch(error)) return ACCOUNT_MISMATCH
    return dbFailure(error, "Não foi possível salvar o lançamento.")
  }
  if (data.length === 0) return ENTRY_NOT_FOUND
  return { ok: true, data: null }
}

export async function removeEntry(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return ENTRY_NOT_FOUND
  const { data, error } = await supabase.from("finance_entries").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o lançamento.")
  if (data.length === 0) return ENTRY_NOT_FOUND
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
    .select("kind, account, description, amount_cents, day_of_month, category, client_id, project_id, starts_on, ends_on")
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
      account: recurrence.account,
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
export async function patchOccurrence(
  supabase: SupabaseServerClient,
  recurrenceId: string,
  period: unknown,
  patch: unknown
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(recurrenceId) || !isPeriod(period)) return RECURRENCE_NOT_FOUND
  const parsed = parseEntryPatch(patch)
  if (!parsed.ok) return parsed
  const occurrence = await ensureOccurrence(supabase, recurrenceId, period)
  if (!occurrence.ok) return occurrence
  if (Object.keys(parsed.value).length > 0) {
    const { error } = await supabase.from("finance_entries").update(parsed.value).eq("id", occurrence.data.id)
    if (error) {
      if (isAccountMismatch(error)) return ACCOUNT_MISMATCH
      return dbFailure(error, "Não foi possível salvar o lançamento.")
    }
  }
  return occurrence
}

export async function insertRecurrence(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseRecurrenceInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("finance_recurrences").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a recorrência.")
  return { ok: true, data: { id: data.id } }
}

/** Muda a recorrência: vale para os meses ainda não gravados (os gravados ficam como estão). */
export async function patchRecurrence(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return RECURRENCE_NOT_FOUND
  const parsed = parseRecurrencePatch(patch)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("finance_recurrences").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (isAccountMismatch(error)) return ACCOUNT_MISMATCH
    if (error.code === "23514") return { ok: false, error: "O fim não pode ser antes do começo." }
    return dbFailure(error, "Não foi possível salvar a recorrência.")
  }
  if (data.length === 0) return RECURRENCE_NOT_FOUND
  return { ok: true, data: null }
}

/** Apaga a recorrência. Os meses já gravados (pagos, por exemplo) continuam no histórico. */
export async function removeRecurrence(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return RECURRENCE_NOT_FOUND
  const { data, error } = await supabase.from("finance_recurrences").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a recorrência.")
  if (data.length === 0) return RECURRENCE_NOT_FOUND
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Fechamento do mês                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fecha um mês já encerrado: guarda o saldo pelos lançamentos (calculado aqui,
 * no servidor) e o do extrato. Depois disso, os pagamentos do mês não mudam.
 */
export async function closeMonthWith(
  supabase: SupabaseServerClient,
  input: unknown,
  today: DateKey = todayKey()
): Promise<ActionResult<{ ledger_balance_cents: number }>> {
  const parsed = parseClosingInput(input)
  if (!parsed.ok) return parsed
  const { period, bank_balance_cents, notes } = parsed.value
  const end = monthRangeOf(period).end
  if (end >= today) return { ok: false, error: "Só dá para fechar um mês depois que ele termina." }
  const finance = await fetchFinance(supabase)
  if (period < finance.settings.opening_on) {
    return { ok: false, error: "Esse mês é anterior ao início do controle (veja os parâmetros)." }
  }
  // Fecha em ordem: o saldo de um mês depende de todos os anteriores.
  const closed = new Set(finance.closings.map((closing) => closing.period))
  for (let earlier = finance.settings.opening_on; earlier < period; earlier = addPeriods(earlier, 1)) {
    if (!closed.has(earlier)) return { ok: false, error: `Feche ${periodLabel(earlier).toLocaleLowerCase("pt-BR")} antes.` }
  }
  const ledger = ledgerBalance(indexFinance(finance, today), end)
  const { error } = await supabase
    .from("finance_closings")
    .insert({ period, ledger_balance_cents: ledger, bank_balance_cents, notes })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esse mês já foi fechado." }
    return dbFailure(error, "Não foi possível fechar o mês.")
  }
  return { ok: true, data: { ledger_balance_cents: ledger } }
}

/** Reabre um mês fechado (os pagamentos dele voltam a poder mudar). */
export async function reopenMonthWith(supabase: SupabaseServerClient, period: unknown): Promise<ActionResult> {
  if (!isPeriod(period)) return { ok: false, error: "Mês inválido." }
  const { data: later, error: readError } = await supabase.from("finance_closings").select("period").gt("period", period).limit(1)
  if (readError) return dbFailure(readError, "Não foi possível reabrir o mês.")
  if (later.length > 0) return { ok: false, error: "Reabra antes os meses fechados depois deste." }
  const { data, error } = await supabase.from("finance_closings").delete().eq("period", period).select("period")
  if (error) return dbFailure(error, "Não foi possível reabrir o mês.")
  if (data.length === 0) return { ok: false, error: "Esse mês não está fechado." }
  return { ok: true, data: null }
}
