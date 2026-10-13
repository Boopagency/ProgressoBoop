"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { insertDecision, patchDecision, removeDecision } from "@/features/decisions/mutations"
import type { DecisionInput, DecisionPatch } from "@/features/decisions/validation"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions das decisões: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createDecision(input: DecisionInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertDecision(await createClient(), input))
}

export async function updateDecision(id: string, patch: DecisionPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchDecision(await createClient(), id, patch))
}

export async function deleteDecision(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeDecision(await createClient(), id))
}
