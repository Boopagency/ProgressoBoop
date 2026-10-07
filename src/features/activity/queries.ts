import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActivityEntry, ActivityEntityType } from "@/lib/types"

export const ACTIVITY_COLUMNS =
  "id, entity_type, entity_id, entity_title, project_id, client_id, action, changes, body, actor_id, created_at, edited_at"

export type ActivityScope =
  | { entity: { type: ActivityEntityType; id: string } }
  | { projectId: string }
  | { clientId: string }

/** Formato do banco → tipo do app (changes vem como JSON genérico). */
export function asActivity(row: Record<string, unknown>): ActivityEntry {
  const changes = row.changes && typeof row.changes === "object" && !Array.isArray(row.changes) ? row.changes : {}
  return { ...(row as unknown as ActivityEntry), changes: changes as ActivityEntry["changes"] }
}

/** Linha do tempo de um item, de um projeto ou de um cliente (mais recente primeiro). */
export async function getActivity(scope: ActivityScope, limit = 120): Promise<ActivityEntry[]> {
  await requireUser()
  const supabase = await createClient()
  let query = supabase.from("activity").select(ACTIVITY_COLUMNS)
  if ("entity" in scope) query = query.eq("entity_type", scope.entity.type).eq("entity_id", scope.entity.id)
  else if ("projectId" in scope) query = query.eq("project_id", scope.projectId)
  else query = query.eq("client_id", scope.clientId)
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit)
  if (error) throw loadError(error, "o histórico")
  return data.map((row) => asActivity(row))
}
