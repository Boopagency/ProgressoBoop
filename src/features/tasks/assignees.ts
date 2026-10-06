import "server-only"

import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/** Deixa a tarefa exatamente com estes responsáveis (ids já validados como UUID). */
export async function setAssignees(
  supabase: SupabaseServerClient,
  taskId: string,
  profileIds: string[]
): Promise<ActionResult> {
  const { error: addError } = await supabase
    .from("task_assignees")
    .upsert(
      profileIds.map((profileId) => ({ task_id: taskId, profile_id: profileId })),
      { onConflict: "task_id,profile_id", ignoreDuplicates: true }
    )
  if (addError) return dbFailure(addError, "Não foi possível salvar os responsáveis.")

  // Os ids já foram validados como UUID, então podem entrar no filtro.
  const { error: removeError } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .not("profile_id", "in", `(${profileIds.join(",")})`)
  if (removeError) return dbFailure(removeError, "Não foi possível salvar os responsáveis.")

  return { ok: true, data: null }
}
