"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Visões salvas da tela Tarefas: nome + parâmetros da URL. São da equipe
 * toda (filtros como "Minhas" valem para quem abre).
 */

const NOT_FOUND = { ok: false, error: "Essa visão não existe mais." } as const
const NAME_MAX = 60
const KNOWN_PARAMS = ["pessoa", "status", "area", "cliente", "projeto", "prazo", "ver"]

function cleanName(raw: unknown): string | null {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : ""
  return name && name.length <= NAME_MAX ? name : null
}

/** Só os parâmetros conhecidos, curtos (a visão guarda filtros, não dados). */
function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null
  const params = new URLSearchParams(raw)
  const clean = new URLSearchParams()
  for (const key of KNOWN_PARAMS) {
    const value = params.get(key)
    if (value && value.length <= 64 && /^[\w-]+$/.test(value)) clean.set(key, value)
  }
  return clean.toString()
}

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createSavedView(name: string, query: string): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const cleanedName = cleanName(name)
  if (!cleanedName) return { ok: false, error: "Dê um nome curto à visão (até 60 letras)." }
  const cleanedQuery = cleanQuery(query)
  if (cleanedQuery === null) return { ok: false, error: "Filtros inválidos." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("saved_views")
    .insert({ name: cleanedName, query: cleanedQuery })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível salvar a visão.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateSavedView(
  id: string,
  patch: { name?: string; query?: string }
): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || typeof patch !== "object" || patch === null) return NOT_FOUND
  const changes: { name?: string; query?: string } = {}
  if (patch.name !== undefined) {
    const name = cleanName(patch.name)
    if (!name) return { ok: false, error: "Dê um nome curto à visão (até 60 letras)." }
    changes.name = name
  }
  if (patch.query !== undefined) {
    const query = cleanQuery(patch.query)
    if (query === null) return { ok: false, error: "Filtros inválidos." }
    changes.query = query
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from("saved_views").update(changes).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar a visão.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteSavedView(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("saved_views").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a visão.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}
