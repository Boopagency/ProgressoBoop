"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { defaultChecklist } from "@/features/clients/logic"
import { clientContentImages, removeContentImages } from "@/features/content/storage"
import {
  isPeriod,
  parseClientInput,
  parseReviewPatch,
  type ClientInput,
  type ReviewPatch,
} from "@/features/clients/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { isDateKey } from "@/lib/dates"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions dos Clientes. O banco cuida de datas de atualização e de
 * quem concluiu cada revisão (triggers) e das permissões (RLS).
 */

const NOT_FOUND = { ok: false, error: "Esse cliente não existe mais." } as const
const TITLE_MAX = 200

function refreshApp() {
  revalidatePath("/", "layout")
}

function nameTaken(code: string | undefined) {
  return code === "23505"
}

export async function addClient(input: ClientInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseClientInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").insert(parsed.value).select("id").single()
  if (error) {
    if (nameTaken(error.code)) return { ok: false, error: "Já existe um cliente com esse nome." }
    return dbFailure(error, "Não foi possível cadastrar o cliente.")
  }
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateClient(id: string, input: ClientInput): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseClientInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (nameTaken(error.code)) return { ok: false, error: "Já existe um cliente com esse nome." }
    return dbFailure(error, "Não foi possível salvar o cliente.")
  }
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** Ativo ou inativo (inativos saem das listas de escolha e das revisões). */
export async function setClientActive(id: string, active: boolean): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || typeof active !== "boolean") return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").update({ active }).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o cliente.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/**
 * Exclui o cliente, as revisões, as comunicações e os posts dele (com as
 * imagens). Tarefas, projetos, eventos, processos, decisões e lançamentos
 * continuam, sem o cliente.
 */
export async function deleteClient(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  // Os posts saem em cascata: as imagens deles (e a foto do perfil) são lidas antes.
  const images = await clientContentImages(supabase, id)
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o cliente.")
  if (data.length === 0) return NOT_FOUND
  await removeContentImages(supabase, images)
  refreshApp()
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Revisão mensal                                                      */
/* ------------------------------------------------------------------ */

/** Revisão do mês; criada (com o checklist padrão) na primeira mudança. */
async function ensureReview(
  supabase: SupabaseServerClient,
  clientId: string,
  period: DateKey
): Promise<ActionResult<{ id: string }>> {
  const { data: existing, error } = await supabase
    .from("client_reviews")
    .select("id")
    .eq("client_id", clientId)
    .eq("period", period)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir a revisão.")
  if (existing) return { ok: true, data: { id: existing.id } }

  const { data: created, error: insertError } = await supabase
    .from("client_reviews")
    .insert({ client_id: clientId, period, checklist: defaultChecklist() as unknown as Json })
    .select("id")
    .single()
  if (insertError) {
    // Outra pessoa abriu a mesma revisão no mesmo instante: usa a dela.
    if (insertError.code === "23505") return ensureReview(supabase, clientId, period)
    if (insertError.code === "23503") return NOT_FOUND
    return dbFailure(insertError, "Não foi possível abrir a revisão.")
  }
  return { ok: true, data: { id: created.id } }
}

export async function saveReview(
  clientId: string,
  period: DateKey,
  patch: ReviewPatch
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(clientId) || !isPeriod(period)) return NOT_FOUND
  const parsed = parseReviewPatch(patch)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const review = await ensureReview(supabase, clientId, period)
  if (!review.ok) return review
  if (Object.keys(parsed.value).length > 0) {
    const { checklist, ...rest } = parsed.value
    const { error } = await supabase
      .from("client_reviews")
      .update({ ...rest, ...(checklist ? { checklist: checklist as unknown as Json } : {}) })
      .eq("id", review.data.id)
    if (error) return dbFailure(error, "Não foi possível salvar a revisão.")
  }
  refreshApp()
  return review
}

/** Concluir (ou reabrir) a revisão do mês. */
export async function setReviewDone(
  clientId: string,
  period: DateKey,
  done: boolean
): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId) || !isPeriod(period) || typeof done !== "boolean") return NOT_FOUND

  const supabase = await createClient()
  const review = await ensureReview(supabase, clientId, period)
  if (!review.ok) return review
  const { error } = await supabase.from("client_reviews").update({ done }).eq("id", review.data.id)
  if (error) return dbFailure(error, "Não foi possível salvar a revisão.")
  refreshApp()
  return { ok: true, data: null }
}

export interface ReviewStepInput {
  title: string
  assignee_ids: string[]
  due_date: DateKey | null
}

/** Próximo passo da revisão: vira tarefa do cliente, ligada à revisão. */
export async function addReviewStep(
  clientId: string,
  period: DateKey,
  input: ReviewStepInput
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(clientId) || !isPeriod(period)) return NOT_FOUND
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
  if (!title) return { ok: false, error: "Escreva o próximo passo." }
  if (title.length > TITLE_MAX) return { ok: false, error: "Texto muito longo." }
  const assignees = Array.isArray(input.assignee_ids) ? [...new Set(input.assignee_ids)] : []
  if (assignees.length === 0 || !assignees.every(isUuid)) {
    return { ok: false, error: "Escolha pelo menos um responsável." }
  }
  if (input.due_date !== null && !isDateKey(input.due_date)) return { ok: false, error: "Prazo inválido." }

  const supabase = await createClient()
  const review = await ensureReview(supabase, clientId, period)
  if (!review.ok) return review

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      due_date: input.due_date,
      client_id: clientId,
      client_review_id: review.data.id,
      area: "clients",
    })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")

  const assigned = await setAssignees(supabase, task.id, assignees)
  if (!assigned.ok) {
    await supabase.from("tasks").delete().eq("id", task.id)
    return assigned
  }

  refreshApp()
  return { ok: true, data: { id: task.id } }
}
