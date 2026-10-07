import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { DEFAULT_SETTINGS, type FinanceData } from "@/features/finance/management"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

const ENTRY_COLUMNS =
  "id, kind, account, description, amount_cents, fee_cents, due_on, paid_on, skipped, category, client_id, project_id, recurrence_id, period, notes, created_by, created_at, updated_at"
const RECURRENCE_COLUMNS =
  "id, kind, account, description, amount_cents, day_of_month, category, client_id, project_id, starts_on, ends_on, notes, created_by, created_at, updated_at"
const SETTINGS_COLUMNS =
  "tax_rate_bps, tax_rate_confirmed, reserve_months, reserve_share_bps, reinvest_share_bps, partners, owner_draw_target_cents, opening_balance_cents, opening_on, contract_alert_days, updated_by, updated_at"

export type { FinanceData }

/**
 * Lançamentos, recorrências, parâmetros e meses fechados (o volume de uma
 * agência pequena cabe inteiro; os números saem das funções puras).
 */
export const getFinance = cache(async (): Promise<FinanceData> => {
  await requireUser()
  const supabase = await createClient()
  const [entries, recurrences, settings, closings] = await Promise.all([
    supabase.from("finance_entries").select(ENTRY_COLUMNS).order("due_on").limit(10000),
    supabase.from("finance_recurrences").select(RECURRENCE_COLUMNS).order("created_at"),
    supabase.from("finance_settings").select(SETTINGS_COLUMNS).maybeSingle(),
    supabase.from("finance_closings").select("period, ledger_balance_cents, bank_balance_cents, notes, closed_by, closed_at").order("period"),
  ])
  if (entries.error) throw loadError(entries.error, "os lançamentos")
  if (recurrences.error) throw loadError(recurrences.error, "as recorrências")
  if (settings.error) throw loadError(settings.error, "os parâmetros do financeiro")
  if (closings.error) throw loadError(closings.error, "os fechamentos")
  return {
    entries: entries.data,
    recurrences: recurrences.data,
    settings: settings.data ?? DEFAULT_SETTINGS,
    closings: closings.data,
  }
})
