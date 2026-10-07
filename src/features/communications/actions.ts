"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  parseCommunicationInput,
  parseCommunicationPatch,
  type CommunicationInput,
  type CommunicationPatch,
} from "@/features/communications/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { isDateKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions das comunicações com clientes. */

const NOT_FOUND = { ok: false, error: "Essa comunicação não existe mais." } as const
const TITLE_MAX = 200

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createCommunication(input: CommunicationInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseCommunicationInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("communications").insert(parsed.value).select("id").single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse cliente não existe mais." }
    return dbFailure(error, "Não foi possível registrar.")
  }
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateCommunication(id: string, patch: CommunicationPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseCommunicationPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("communications").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteCommunication(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("communications").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export interface CommunicationTaskInput {
  title: string
  assignee_ids: string[]
  due_date: DateKey | null
}

/** Pedido do cliente vira tarefa: com o cliente, o projeto e a origem. */
export async function createTaskFromCommunication(
  id: string,
  input: CommunicationTaskInput
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
  if (!title) return { ok: false, error: "Dê um título à tarefa." }
  if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
  const assignees = Array.isArray(input.assignee_ids) ? [...new Set(input.assignee_ids)] : []
  if (assignees.length === 0 || !assignees.every(isUuid)) return { ok: false, error: "Escolha pelo menos um responsável." }
  if (input.due_date !== null && !isDateKey(input.due_date)) return { ok: false, error: "Prazo inválido." }

  const supabase = await createClient()
  const { data: communication, error: readError } = await supabase
    .from("communications")
    .select("client_id, project_id, details, summary")
    .eq("id", id)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível criar a tarefa.")
  if (!communication) return NOT_FOUND

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: communication.details ?? (communication.summary !== title ? communication.summary : null),
      due_date: input.due_date,
      client_id: communication.client_id,
      project_id: communication.project_id,
      communication_id: id,
      area: "clients",
    })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")
  const assigned = await setAssignees(supabase, task.id, assignees)
  if (!assigned.ok) {
    await supabase.from("tasks").delete().eq("id", task.id)
    return assigned
  }
  refreshApp()
  return { ok: true, data: { id: task.id } }
}
