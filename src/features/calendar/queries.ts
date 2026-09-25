import "server-only"

import { requireUser } from "@/features/auth/session"
import type { CalendarEvent } from "@/lib/types"
import { mockDb, snapshot } from "@/server/mock/db"

/** Todos os eventos; os recorrentes são expandidos no cliente para o período visível. */
export async function getEvents(): Promise<CalendarEvent[]> {
  await requireUser()
  return snapshot(mockDb().events)
}
