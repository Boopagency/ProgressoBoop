import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { FinanceEntry, FinanceRecurrence } from "@/lib/types"

const ENTRY_COLUMNS =
  "id, kind, description, amount_cents, due_on, paid_on, skipped, category, client_id, project_id, recurrence_id, period, notes, created_by, created_at, updated_at"
const RECURRENCE_COLUMNS =
  "id, kind, description, amount_cents, day_of_month, category, client_id, project_id, starts_on, ends_on, notes, created_by, created_at, updated_at"

export interface FinanceData {
  entries: FinanceEntry[]
  recurrences: FinanceRecurrence[]
}

/** Lançamentos e recorrências (o volume de uma agência pequena cabe inteiro). */
export async function getFinance(): Promise<FinanceData> {
  await requireUser()
  const supabase = await createClient()
  const [entries, recurrences] = await Promise.all([
    supabase.from("finance_entries").select(ENTRY_COLUMNS).order("due_on").limit(5000),
    supabase.from("finance_recurrences").select(RECURRENCE_COLUMNS).order("created_at"),
  ])
  if (entries.error) throw loadError(entries.error, "os lançamentos")
  if (recurrences.error) throw loadError(recurrences.error, "as recorrências")
  return { entries: entries.data, recurrences: recurrences.data }
}
