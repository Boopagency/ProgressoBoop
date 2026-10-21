"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { clientFilePaths, removeClientFileObjects } from "@/features/client-files/storage"
import {
  insertClient,
  insertReviewStep,
  NOT_FOUND,
  writeClient,
  writeClientActive,
  writeReview,
  writeReviewDone,
  type ReviewStepInput,
} from "@/features/clients/mutations"
import type { ClientInput, ReviewPatch } from "@/features/clients/validation"
import { clientContentImages, removeContentImages } from "@/features/content/storage"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions dos Clientes: a sessão e a tela; a regra fica em mutations.ts. */

function refreshApp() {
  revalidatePath("/", "layout")
}

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) refreshApp()
  return result
}

export async function addClient(input: ClientInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertClient(await createClient(), input))
}

export async function updateClient(id: string, input: ClientInput): Promise<ActionResult> {
  await requireUser()
  return refreshed(await writeClient(await createClient(), id, input))
}

/** Ativo ou inativo (inativos saem das listas de escolha e das revisões). */
export async function setClientActive(id: string, active: boolean): Promise<ActionResult> {
  await requireUser()
  return refreshed(await writeClientActive(await createClient(), id, active))
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
  // Os posts e os documentos saem em cascata: as imagens deles (e a foto do
  // perfil) e os arquivos são lidos antes.
  const [images, files] = await Promise.all([clientContentImages(supabase, id), clientFilePaths(supabase, id)])
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o cliente.")
  if (data.length === 0) return NOT_FOUND
  await Promise.all([removeContentImages(supabase, images), removeClientFileObjects(supabase, files)])
  refreshApp()
  return { ok: true, data: null }
}

export async function saveReview(
  clientId: string,
  period: DateKey,
  patch: ReviewPatch
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await writeReview(await createClient(), clientId, period, patch))
}

/** Concluir (ou reabrir) a revisão do mês. */
export async function setReviewDone(clientId: string, period: DateKey, done: boolean): Promise<ActionResult> {
  await requireUser()
  return refreshed(await writeReviewDone(await createClient(), clientId, period, done))
}

/** Próximo passo da revisão: vira tarefa do cliente, ligada à revisão. */
export async function addReviewStep(
  clientId: string,
  period: DateKey,
  input: ReviewStepInput
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertReviewStep(await createClient(), clientId, period, input))
}
