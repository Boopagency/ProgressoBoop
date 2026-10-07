import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Deal } from "@/lib/types"

export const DEAL_COLUMNS =
  "id, title, client_id, company, contact_name, contact_email, contact_phone, source, service, stage, reached_stage, owner_id, recurring_cents, one_time_cents, term_months, probability, opened_on, expected_close_on, proposal_sent_on, closed_on, lost_reason, project_id, recurrence_id, notes, created_by, created_at, updated_at"

/** Todos os negócios (os números do comercial saem deles). */
export const getDeals = cache(async (): Promise<Deal[]> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("deals").select(DEAL_COLUMNS).order("updated_at", { ascending: false }).limit(5000)
  if (error) throw loadError(error, "os negócios")
  return data
})
