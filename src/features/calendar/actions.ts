"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { parseEventInput, type EventInput } from "@/features/calendar/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions dos eventos. Eventos recorrentes são editados e excluídos
 * como série (todas as ocorrências).
 */

const NOT_FOUND = { ok: false, error: "Esse evento não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.from("events").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o evento.")

  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("events")
    .update(parsed.value)
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o evento.")
  if (data.length === 0) return NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("events").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o evento.")
  if (data.length === 0) return NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}
