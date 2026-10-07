import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Communication } from "@/lib/types"

export const COMMUNICATION_COLUMNS =
  "id, client_id, project_id, kind, channel, summary, details, occurred_on, created_by, created_at, updated_at"

/** Comunicações (todas, ou de um cliente), a mais recente primeiro. */
export async function getCommunications(clientId?: string): Promise<Communication[]> {
  await requireUser()
  const supabase = await createClient()
  let query = supabase.from("communications").select(COMMUNICATION_COLUMNS)
  if (clientId) query = query.eq("client_id", clientId)
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw loadError(error, "as comunicações")
  return data
}
