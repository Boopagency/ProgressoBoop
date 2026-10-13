import "server-only"

import { setAssignees } from "@/features/tasks/assignees"
import { parseTaskInput, parseTaskPatch } from "@/features/tasks/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações das tarefas, usadas pelas Server Actions (sessão do app) e pelo
 * conector do Claude (token OAuth da pessoa): mesma validação, mesmo RLS. O
 * banco garante o resto: completed_at e updated_at (trigger
 * set_task_timestamps), histórico, avisos e chaves estrangeiras.
 */

const NOT_FOUND = { ok: false, error: "Essa tarefa não existe mais." } as const

export async function insertTask(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTaskInput(input)
  if (!parsed.ok) return parsed
  const { assignee_ids, ...fields } = parsed.value

  const { data: task, error } = await supabase.from("tasks").insert(fields).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")

  const assigned = await setAssignees(supabase, task.id, assignee_ids)
  if (!assigned.ok) {
    // Uma tarefa sem responsáveis sumiria das listas "Minhas": desfaz a criação.
    await supabase.from("tasks").delete().eq("id", task.id)
    return assigned
  }
  return { ok: true, data: { id: task.id } }
}

export async function patchTask(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseTaskPatch(patch)
  if (!parsed.ok) return parsed
  const { assignee_ids, ...fields } = parsed.value

  // Mesmo quando só os responsáveis mudam, a tarefa é "tocada": confirma que
  // ela existe e atualiza updated_at (o trigger define o horário).
  const changes = Object.keys(fields).length > 0 ? fields : { updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from("tasks").update(changes).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar a tarefa.")
  if (data.length === 0) return NOT_FOUND

  if (assignee_ids) {
    const assigned = await setAssignees(supabase, id, assignee_ids)
    if (!assigned.ok) return assigned
  }
  return { ok: true, data: null }
}

export async function removeTask(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a tarefa.")
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}
