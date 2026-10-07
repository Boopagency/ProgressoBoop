import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Decision } from "@/lib/types"

export const DECISION_COLUMNS =
  "id, title, context, decided_on, status, area, client_id, project_id, meeting_id, created_by, created_at, updated_at"

/** Todas as decisões, a mais recente primeiro (o volume é pequeno). */
export async function getDecisions(): Promise<Decision[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("decisions")
    .select(DECISION_COLUMNS)
    .order("decided_on", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) throw loadError(error, "as decisões")
  return data
}
