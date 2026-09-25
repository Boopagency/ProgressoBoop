"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { isDateKey, weekRangeOf } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

const CONTENT_MAX = 500
const NOT_FOUND = { ok: false, error: "Essa decisão não existe mais." } as const

export async function addDecision(content: string, weekStart: DateKey): Promise<ActionResult> {
  await requireUser()
  const text = typeof content === "string" ? content.trim() : ""
  if (!text) return { ok: false, error: "Escreva a decisão." }
  if (text.length > CONTENT_MAX) return { ok: false, error: "Decisão muito longa." }
  if (!isDateKey(weekStart) || weekRangeOf(weekStart).start !== weekStart) {
    return { ok: false, error: "Semana inválida." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("weekly_decisions")
    .insert({ content: text, week_start: weekStart })
  if (error) return dbFailure(error, "Não foi possível registrar a decisão.")

  revalidatePath("/segunda")
  return { ok: true, data: null }
}

export async function deleteDecision(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("weekly_decisions")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a decisão.")
  if (data.length === 0) return NOT_FOUND

  revalidatePath("/segunda")
  return { ok: true, data: null }
}
