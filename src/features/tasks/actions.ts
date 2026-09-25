"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  parseTaskInput,
  parseTaskPatch,
  type TaskInput,
  type TaskPatch,
} from "@/features/tasks/validation"
import type { ActionResult, Task } from "@/lib/types"
import { mockDb, newId } from "@/server/mock/db"

/*
 * Server Actions das tarefas. Etapa 1: alteram o "banco" em memória, imitando
 * as regras que o Postgres terá na etapa 2 (chaves estrangeiras e o trigger de
 * completed_at/updated_at). A assinatura não muda na troca para o Supabase.
 */

function checkReferences(patch: TaskPatch): string | null {
  const db = mockDb()
  if (patch.assignee_ids?.some((id) => !db.profiles.some((profile) => profile.id === id))) {
    return "Responsável não encontrado."
  }
  if (patch.client_id && !db.clients.some((client) => client.id === patch.client_id)) {
    return "Cliente não encontrado."
  }
  if (patch.plan_id && !db.plans.some((plan) => plan.id === patch.plan_id)) {
    return "Plano não encontrado."
  }
  return null
}

/** Equivalente ao trigger `set_task_timestamps` da etapa 2. */
function withTimestamps(previous: Task | null, next: Task): Task {
  const now = new Date().toISOString()
  const becameDone = next.status === "done" && previous?.status !== "done"
  return {
    ...next,
    updated_at: now,
    completed_at:
      next.status !== "done" ? null : becameDone ? now : (previous?.completed_at ?? now),
  }
}

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = parseTaskInput(input)
  if (!parsed.ok) return parsed
  const referenceError = checkReferences(parsed.value)
  if (referenceError) return { ok: false, error: referenceError }

  const now = new Date().toISOString()
  const task = withTimestamps(null, {
    id: newId("task"),
    ...parsed.value,
    completed_at: null,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  })
  mockDb().tasks.push(task)

  refreshApp()
  return { ok: true, data: { id: task.id } }
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  await requireUser()
  const parsed = parseTaskPatch(patch)
  if (!parsed.ok) return parsed
  const referenceError = checkReferences(parsed.value)
  if (referenceError) return { ok: false, error: referenceError }

  const tasks = mockDb().tasks
  const index = tasks.findIndex((task) => task.id === id)
  const current = tasks[index]
  if (!current) return { ok: false, error: "Essa tarefa não existe mais." }

  tasks[index] = withTimestamps(current, { ...current, ...parsed.value })

  refreshApp()
  return { ok: true, data: null }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireUser()
  const db = mockDb()
  const before = db.tasks.length
  db.tasks = db.tasks.filter((task) => task.id !== id)
  if (db.tasks.length === before) return { ok: false, error: "Essa tarefa não existe mais." }

  refreshApp()
  return { ok: true, data: null }
}
