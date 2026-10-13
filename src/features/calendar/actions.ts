"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { insertEvent, patchEvent, removeEvent } from "@/features/calendar/mutations"
import type { EventInput } from "@/features/calendar/validation"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions dos eventos: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertEvent(await createClient(), input))
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchEvent(await createClient(), id, input))
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeEvent(await createClient(), id))
}
