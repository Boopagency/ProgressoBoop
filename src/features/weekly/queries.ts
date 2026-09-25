import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { DateKey, WeeklyDecision } from "@/lib/types"

/** Decisões das semanas pedidas, em ordem de criação. */
export async function getDecisions(weekStarts: DateKey[]): Promise<WeeklyDecision[]> {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("weekly_decisions")
    .select("id, content, week_start, created_by, created_at")
    .in("week_start", weekStarts)
    .order("created_at")
  if (error) throw loadError(error, "as decisões")

  return data
}
