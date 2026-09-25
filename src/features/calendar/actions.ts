"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { parseEventInput, type EventInput } from "@/features/calendar/validation"
import type { ActionResult } from "@/lib/types"
import { mockDb, newId } from "@/server/mock/db"

/*
 * Server Actions dos eventos. Etapa 1: "banco" em memória. Eventos recorrentes
 * são editados e excluídos como série (todas as ocorrências).
 */

function clientExists(clientId: string | null): boolean {
  return clientId === null || mockDb().clients.some((client) => client.id === clientId)
}

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed
  if (!clientExists(parsed.value.client_id)) return { ok: false, error: "Cliente não encontrado." }

  const id = newId("event")
  mockDb().events.push({
    id,
    ...parsed.value,
    created_by: user.id,
    created_at: new Date().toISOString(),
  })

  refreshApp()
  return { ok: true, data: { id } }
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  await requireUser()
  const parsed = parseEventInput(input)
  if (!parsed.ok) return parsed
  if (!clientExists(parsed.value.client_id)) return { ok: false, error: "Cliente não encontrado." }

  const events = mockDb().events
  const index = events.findIndex((event) => event.id === id)
  const current = events[index]
  if (!current) return { ok: false, error: "Esse evento não existe mais." }
  events[index] = { ...current, ...parsed.value }

  refreshApp()
  return { ok: true, data: null }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await requireUser()
  const db = mockDb()
  const before = db.events.length
  db.events = db.events.filter((event) => event.id !== id)
  if (db.events.length === before) return { ok: false, error: "Esse evento não existe mais." }

  refreshApp()
  return { ok: true, data: null }
}
