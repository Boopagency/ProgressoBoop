"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { isDateKey, weekRangeOf } from "@/lib/dates"
import type { ActionResult, DateKey } from "@/lib/types"
import { mockDb, newId } from "@/server/mock/db"

const CONTENT_MAX = 500

export async function addDecision(content: string, weekStart: DateKey): Promise<ActionResult> {
  const user = await requireUser()
  const text = typeof content === "string" ? content.trim() : ""
  if (!text) return { ok: false, error: "Escreva a decisão." }
  if (text.length > CONTENT_MAX) return { ok: false, error: "Decisão muito longa." }
  if (!isDateKey(weekStart) || weekRangeOf(weekStart).start !== weekStart) {
    return { ok: false, error: "Semana inválida." }
  }

  mockDb().decisions.push({
    id: newId("decision"),
    content: text,
    week_start: weekStart,
    created_by: user.id,
    created_at: new Date().toISOString(),
  })

  revalidatePath("/segunda")
  return { ok: true, data: null }
}

export async function deleteDecision(id: string): Promise<ActionResult> {
  await requireUser()
  const db = mockDb()
  const before = db.decisions.length
  db.decisions = db.decisions.filter((decision) => decision.id !== id)
  if (db.decisions.length === before) return { ok: false, error: "Essa decisão não existe mais." }

  revalidatePath("/segunda")
  return { ok: true, data: null }
}
