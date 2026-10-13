"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/features/auth/session"
import type { EventInput } from "@/features/calendar/validation"
import {
  agreementTask,
  ensureMeeting,
  insertMeeting,
  insertMeetingItem,
  insertOccurrenceItem,
  patchMeetingItem,
  removeMeeting,
  removeMeetingItem,
  writeMeetingStatus,
  writeMeetingText,
} from "@/features/meetings/mutations"
import type { MeetingItemInput, MeetingItemPatch } from "@/features/meetings/validation"
import { isDateKey } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey, MeetingStatus } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions das reuniões: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

/** Abre a reunião (criando o registro, se preciso) e navega para ela. */
export async function openMeeting(eventId: string, date: DateKey): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(eventId) || !isDateKey(date)) return { ok: false, error: "Essa reunião não existe mais." }

  const ensured = refreshed(await ensureMeeting(await createClient(), eventId, date))
  if (!ensured.ok) return ensured
  redirect(`/reunioes/${ensured.data.id}`)
}

/** Nova reunião: cria o evento no calendário e o registro, e devolve o id do registro. */
export async function scheduleMeeting(input: EventInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertMeeting(await createClient(), input))
}

/** Resumo ou transcrição. Salva sem recarregar a tela (o texto já está nela). */
export async function saveMeetingText(
  id: string,
  field: "summary" | "transcript",
  value: string | null
): Promise<ActionResult> {
  await requireUser()
  return writeMeetingText(await createClient(), id, field, value)
}

/**
 * Encerrar guarda a pauta como está agora (para o histórico mostrar o que foi
 * discutido). Reabrir e cancelar descartam a pauta guardada.
 */
export async function setMeetingStatus(id: string, status: MeetingStatus): Promise<ActionResult> {
  await requireUser()
  return refreshed(await writeMeetingStatus(await createClient(), id, status))
}

/** Apaga o registro (assuntos, combinados, resumo e transcrição). O evento continua no calendário. */
export async function deleteMeeting(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeMeeting(await createClient(), id))
}

export async function addMeetingItem(
  meetingId: string,
  input: MeetingItemInput
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertMeetingItem(await createClient(), meetingId, input))
}

/** Assunto para uma reunião que ainda não foi aberta (cria o registro dela). */
export async function addItemToOccurrence(
  eventId: string,
  date: DateKey,
  input: MeetingItemInput
): Promise<ActionResult<{ id: string; meetingId: string }>> {
  await requireUser()
  return refreshed(await insertOccurrenceItem(await createClient(), eventId, date, input))
}

export async function updateMeetingItem(id: string, patch: MeetingItemPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchMeetingItem(await createClient(), id, patch))
}

export async function deleteMeetingItem(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeMeetingItem(await createClient(), id))
}

/** Combinado → tarefa, num clique (regra em mutations.ts). */
export async function agreementToTask(itemId: string): Promise<ActionResult<{ taskId: string }>> {
  const user = await requireUser()
  return refreshed(await agreementTask(await createClient(), user.id, itemId))
}
