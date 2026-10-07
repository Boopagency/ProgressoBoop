import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { KeyResult, Objective } from "@/lib/types"

/** Objetivos e resultados-chave (o volume é pequeno). */
export async function getGoals(): Promise<{ objectives: Objective[]; keyResults: KeyResult[] }> {
  await requireUser()
  const supabase = await createClient()
  const [objectives, keyResults] = await Promise.all([
    supabase
      .from("objectives")
      .select("id, title, description, area, owner_id, starts_on, ends_on, created_by, created_at, updated_at")
      .order("starts_on", { ascending: false }),
    supabase
      .from("key_results")
      .select("id, objective_id, title, metric, client_id, unit, target_value, baseline_value, manual_value, position, created_by, created_at, updated_at")
      .order("position"),
  ])
  if (objectives.error) throw loadError(objectives.error, "as metas")
  if (keyResults.error) throw loadError(keyResults.error, "os resultados-chave")
  return {
    objectives: objectives.data,
    keyResults: keyResults.data.map((row) => ({
      ...row,
      unit: row.unit as KeyResult["unit"],
      target_value: Number(row.target_value),
      baseline_value: row.baseline_value === null ? null : Number(row.baseline_value),
      manual_value: row.manual_value === null ? null : Number(row.manual_value),
    })),
  }
}
