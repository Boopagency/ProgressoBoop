"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { insertProject, patchProject, removeProject } from "@/features/projects/mutations"
import type { ProjectInput, ProjectPatch, ProjectSource } from "@/features/projects/validation"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions dos projetos: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createProject(
  input: ProjectInput,
  rawSource: ProjectSource
): Promise<ActionResult<{ id: string; tasks: number }>> {
  const user = await requireUser()
  return refreshed(await insertProject(await createClient(), user.id, input, rawSource))
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchProject(await createClient(), id, patch))
}

export async function deleteProject(id: string, withTasks: boolean): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeProject(await createClient(), id, withTasks))
}
