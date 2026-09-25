"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  parseTaskInput,
  parseTaskPatch,
  type TaskInput,
  type TaskPatch,
} from "@/features/tasks/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions das tarefas. O banco garante o resto: completed_at e
 * updated_at (trigger set_task_timestamps), chaves estrangeiras e RLS.
 */

const NOT_FOUND = { ok: false, error: "Essa tarefa não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

/** Deixa a tarefa exatamente com estes responsáveis. */
async function setAssignees(
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

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseTaskInput(input)
  if (!parsed.ok) return parsed
  const { assignee_ids, ...fields } = parsed.value

  const supabase = await createClient()
  const { data: task, error } = await supabase.from("tasks").insert(fields).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")

  const assigned = await setAssignees(supabase, task.id, assignee_ids)
  if (!assigned.ok) {
    // Uma tarefa sem responsáveis sumiria das listas "Minhas": desfaz a criação.
    await supabase.from("tasks").delete().eq("id", task.id)
    return assigned
  }

  refreshApp()
  return { ok: true, data: { id: task.id } }
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseTaskPatch(patch)
  if (!parsed.ok) return parsed
  const { assignee_ids, ...fields } = parsed.value

  const supabase = await createClient()
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

  refreshApp()
  return { ok: true, data: null }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a tarefa.")
  if (data.length === 0) return NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}
