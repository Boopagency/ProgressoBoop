"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  parseDecisionInput,
  parseDecisionPatch,
  type DecisionInput,
  type DecisionPatch,
} from "@/features/decisions/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions das decisões. Histórico e autoria ficam com o banco. */

const NOT_FOUND = { ok: false, error: "Essa decisão não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createDecision(input: DecisionInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseDecisionInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("decisions").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível registrar a decisão.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateDecision(id: string, patch: DecisionPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseDecisionPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("decisions").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar a decisão.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteDecision(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("decisions").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a decisão.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}
