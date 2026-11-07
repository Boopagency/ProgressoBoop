"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { validateDue, validateIdentification, type BriefingIdentification } from "@/features/briefing/logic"
import { todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Lado da equipe do briefing de onboarding: liberar (com os dados do bloco 0
 * conferidos e o prazo), mudar o prazo e cancelar uma liberação que o cliente
 * ainda não começou. Liberado e não enviado, o portal desse cliente só mostra
 * o Briefing.
 */

const CLIENT_GONE = { ok: false, error: "Esse cliente não existe mais." } as const
const BRIEFING_GONE = { ok: false, error: "Esse briefing não existe mais. Atualize a página." } as const

function refresh(clientId: string) {
  revalidatePath(`/clientes/${clientId}`)
  revalidatePath("/portal", "layout")
}

export async function releaseBriefing(
  clientId: string,
  input: { identification: BriefingIdentification; due_on: DateKey }
): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE
  const identification = validateIdentification(input?.identification)
  if (!identification.ok) return identification
  const due = validateDue(input?.due_on, todayKey())
  if (!due.ok) return due

  const supabase = await createClient()
  const { data: template, error: templateError } = await supabase
    .from("briefing_templates")
    .select("id")
    .eq("active", true)
    .maybeSingle()
  if (templateError) return dbFailure(templateError, "Não foi possível liberar o briefing.")
  if (!template) return { ok: false, error: "Nenhum formulário de briefing está ativo." }

  const { error } = await supabase.from("client_briefings").insert({
    client_id: clientId,
    template_id: template.id,
    due_on: due.data,
    identification: { ...identification.data },
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Este cliente já tem um briefing liberado." }
    if (error.code === "23503") return CLIENT_GONE
    return dbFailure(error, "Não foi possível liberar o briefing.")
  }
  refresh(clientId)
  return { ok: true, data: null }
}

export async function changeBriefingDue(clientId: string, dueOn: DateKey): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE
  const due = validateDue(dueOn, todayKey())
  if (!due.ok) return due

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_briefings")
    .update({ due_on: due.data })
    .eq("client_id", clientId)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível mudar o prazo.")
  if (data.length === 0) return BRIEFING_GONE
  refresh(clientId)
  return { ok: true, data: null }
}

/** Desfaz a liberação enquanto o cliente não respondeu nada (o portal volta ao normal). */
export async function cancelBriefing(clientId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE

  const supabase = await createClient()
  const { data: briefing, error: findError } = await supabase
    .from("client_briefings")
    .select("id, status")
    .eq("client_id", clientId)
    .maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível cancelar o briefing.")
  if (!briefing) return BRIEFING_GONE
  const { count, error: countError } = await supabase
    .from("briefing_answers")
    .select("id", { count: "exact", head: true })
    .eq("briefing_id", briefing.id)
  if (countError) return dbFailure(countError, "Não foi possível cancelar o briefing.")
  if (briefing.status !== "not_started" || (count ?? 0) > 0) {
    return { ok: false, error: "O cliente já começou a responder. Não dá mais para cancelar a liberação." }
  }

  const { data, error } = await supabase
    .from("client_briefings")
    .delete()
    .eq("id", briefing.id)
    .eq("status", "not_started")
    .select("id")
  if (error) return dbFailure(error, "Não foi possível cancelar o briefing.")
  if (data.length === 0) return BRIEFING_GONE
  refresh(clientId)
  return { ok: true, data: null }
}
