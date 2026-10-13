"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { insertTask, patchTask, removeTask } from "@/features/tasks/mutations"
import type { TaskInput, TaskPatch } from "@/features/tasks/validation"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions das tarefas: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertTask(await createClient(), input))
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchTask(await createClient(), id, patch))
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeTask(await createClient(), id))
}
