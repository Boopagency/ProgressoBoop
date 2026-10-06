"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/features/auth/session"
import { getEvents } from "@/features/calendar/queries"
import { WEEKLY } from "@/features/calendar/recurrence"
import { parseEventInput, type EventInput } from "@/features/calendar/validation"
import {
  buildAgenda,
  freezeAgenda,
  isMeetingEvent,
  isOccurrenceDate,
  previousRecords,
  recordDate,
} from "@/features/meetings/logic"
import { getMeetingRecords } from "@/features/meetings/queries"
import {
  parseItemInput,
  parseItemPatch,
  parseLongText,
  SUMMARY_MAX,
  TRANSCRIPT_MAX,
  type MeetingItemInput,
  type MeetingItemPatch,
} from "@/features/meetings/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { getTasks } from "@/features/tasks/queries"
import { getWorkspace } from "@/features/workspace/queries"
import { isDateKey, toDateKey, todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey, MeetingStatus } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions das reuniões. O registro de uma reunião nasce quando alguém
 * a abre (ou adiciona um assunto antes dela); até lá, ela é só um evento no
 * calendário. O banco garante autoria, datas de encerramento e RLS.
 */

const MEETING_NOT_FOUND = { ok: false, error: "Essa reunião não existe mais." } as const
const ITEM_NOT_FOUND = { ok: false, error: "Esse item não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

/**
 * Garante o registro da ocorrência e devolve o id. Confere que o evento é
 * uma reunião e que a data é mesmo uma ocorrência dele.
 */
async function ensureMeeting(
  supabase: SupabaseServerClient,
  eventId: string,
  date: DateKey
): Promise<ActionResult<{ id: string }>> {
  const { data: event, error } = await supabase
    .from("events")
    .select("id, title, description, event_type, start_at, end_at, all_day, recurrence_rule, client_id, created_by, created_at")
    .eq("id", eventId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir a reunião.")
  if (!event || !isMeetingEvent(event)) return MEETING_NOT_FOUND

  const recurring = event.recurrence_rule === WEEKLY
  const occursOn = recurring ? date : toDateKey(event.start_at)
  if (recurring && !isOccurrenceDate({ ...event, recurrence_rule: WEEKLY }, occursOn)) {
    return { ok: false, error: "Essa data não é uma ocorrência da reunião." }
  }

  if (!recurring) {
    // Evento único: um registro só, mesmo que a data tenha mudado.
    const { data: existing, error: findError } = await supabase
      .from("meetings")
      .select("id")
      .eq("event_id", eventId)
      .order("created_at")
      .limit(1)
    if (findError) return dbFailure(findError, "Não foi possível abrir a reunião.")
    if (existing[0]) return { ok: true, data: { id: existing[0].id } }
  }

  // Duas pessoas abrindo ao mesmo tempo: a segunda só reaproveita o registro.
  const { error: insertError } = await supabase
    .from("meetings")
    .upsert({ event_id: eventId, occurs_on: occursOn }, {
      onConflict: "event_id,occurs_on",
      ignoreDuplicates: true,
    })
  if (insertError) return dbFailure(insertError, "Não foi possível abrir a reunião.")

  const { data: meeting, error: selectError } = await supabase
    .from("meetings")
    .select("id")
    .eq("event_id", eventId)
    .eq("occurs_on", occursOn)
    .single()
  if (selectError) return dbFailure(selectError, "Não foi possível abrir a reunião.")
  return { ok: true, data: { id: meeting.id } }
}

/** Abre a reunião (criando o registro, se preciso) e navega para ela. */
export async function openMeeting(eventId: string, date: DateKey): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(eventId) || !isDateKey(date)) return MEETING_NOT_FOUND

  const supabase = await createClient()
  const ensured = await ensureMeeting(supabase, eventId, date)
  if (!ensured.ok) return ensured

  refreshApp()
  redirect(`/reunioes/${ensured.data.id}`)
}

/** Nova reunião: cria o evento no calendário e o registro, e devolve o id do registro. */
export async function scheduleMeeting(input: EventInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseEventInput({ ...input, event_type: "meeting" })
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data: event, error } = await supabase.from("events").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a reunião.")

  const ensured = await ensureMeeting(supabase, event.id, toDateKey(parsed.value.start_at))
  if (!ensured.ok) {
    await supabase.from("events").delete().eq("id", event.id)
    return ensured
  }

  refreshApp()
  return { ok: true, data: { id: ensured.data.id } }
}

/** Resumo ou transcrição. Salva sem recarregar a tela (o texto já está nela). */
export async function saveMeetingText(
  id: string,
  field: "summary" | "transcript",
  value: string | null
): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || (field !== "summary" && field !== "transcript")) return MEETING_NOT_FOUND
  const parsed =
    field === "summary"
      ? parseLongText(value, SUMMARY_MAX, "Resumo")
      : parseLongText(value, TRANSCRIPT_MAX, "Transcrição")
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meetings")
    .update(field === "summary" ? { summary: parsed.value } : { transcript: parsed.value })
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return MEETING_NOT_FOUND
  return { ok: true, data: null }
}

/**
 * Encerrar guarda a pauta como está agora (para o histórico mostrar o que foi
 * discutido). Reabrir e cancelar descartam a pauta guardada.
 */
export async function setMeetingStatus(id: string, status: MeetingStatus): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || !["scheduled", "done", "canceled"].includes(status)) return MEETING_NOT_FOUND

  const supabase = await createClient()
  let agenda = null
  if (status === "done") {
    const [events, tasks, workspace, { records, items }] = await Promise.all([
      getEvents(),
      getTasks(),
      getWorkspace(),
      getMeetingRecords(),
    ])
    const record = records.find((candidate) => candidate.id === id)
    const eventById = new Map(events.map((event) => [event.id, event]))
    const event = record ? eventById.get(record.event_id) : undefined
    if (!record || !event) return MEETING_NOT_FOUND
    const date = recordDate(record, event)
    const now = new Date()
    agenda = freezeAgenda(
      buildAgenda({
        event,
        date,
        today: todayKey(now),
        now: now.toISOString(),
        tasks,
        profiles: workspace.profiles,
        plans: workspace.plans,
        previous: previousRecords(event, date, records, eventById),
        previousItems: items,
      })
    )
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({ status, agenda: agenda ? JSON.parse(JSON.stringify(agenda)) : null })
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível atualizar a reunião.")
  if (data.length === 0) return MEETING_NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}

/** Apaga o registro (assuntos, combinados, resumo e transcrição). O evento continua no calendário. */
export async function deleteMeeting(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return MEETING_NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("meetings").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o registro.")
  if (data.length === 0) return MEETING_NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Assuntos e combinados                                               */
/* ------------------------------------------------------------------ */

async function insertItem(
  supabase: SupabaseServerClient,
  meetingId: string,
  item: MeetingItemInput
): Promise<ActionResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("meeting_items")
    .insert({ meeting_id: meetingId, ...item })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23503") return MEETING_NOT_FOUND
    return dbFailure(error, "Não foi possível salvar.")
  }
  return { ok: true, data: { id: data.id } }
}

export async function addMeetingItem(
  meetingId: string,
  input: MeetingItemInput
): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(meetingId)) return MEETING_NOT_FOUND
  const parsed = parseItemInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const result = await insertItem(supabase, meetingId, parsed.value)
  if (result.ok) refreshApp()
  return result
}

/** Assunto para uma reunião que ainda não foi aberta (cria o registro dela). */
export async function addItemToOccurrence(
  eventId: string,
  date: DateKey,
  input: MeetingItemInput
): Promise<ActionResult<{ id: string; meetingId: string }>> {
  await requireUser()
  if (!isUuid(eventId) || !isDateKey(date)) return MEETING_NOT_FOUND
  const parsed = parseItemInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const ensured = await ensureMeeting(supabase, eventId, date)
  if (!ensured.ok) return ensured
  const result = await insertItem(supabase, ensured.data.id, parsed.value)
  if (!result.ok) return result

  refreshApp()
  return { ok: true, data: { id: result.data.id, meetingId: ensured.data.id } }
}

export async function updateMeetingItem(id: string, patch: MeetingItemPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return ITEM_NOT_FOUND
  const parsed = parseItemPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meeting_items")
    .update(parsed.value)
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return ITEM_NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}

export async function deleteMeetingItem(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return ITEM_NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("meeting_items").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir.")
  if (data.length === 0) return ITEM_NOT_FOUND

  refreshApp()
  return { ok: true, data: null }
}

const TITLE_MAX = 200

/**
 * Combinado → tarefa, num clique: título = texto do combinado, responsável =
 * dono do combinado (ou quem clicou), prazo e cliente da reunião. A tarefa
 * guarda a reunião de origem e o combinado passa a seguir o status dela.
 */
export async function agreementToTask(itemId: string): Promise<ActionResult<{ taskId: string }>> {
  const user = await requireUser()
  if (!isUuid(itemId)) return ITEM_NOT_FOUND

  const supabase = await createClient()
  const { data: item, error } = await supabase
    .from("meeting_items")
    .select("id, kind, content, owner_id, due_date, task_id, meeting_id, meetings(events(client_id))")
    .eq("id", itemId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")
  if (!item || item.kind !== "agreement") return ITEM_NOT_FOUND
  if (item.task_id) return { ok: true, data: { taskId: item.task_id } }

  const content = item.content.trim()
  const longText = content.length > TITLE_MAX
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: longText ? `${content.slice(0, TITLE_MAX - 1).trimEnd()}…` : content,
      description: longText ? content : null,
      due_date: item.due_date,
      client_id: item.meetings?.events?.client_id ?? null,
      meeting_id: item.meeting_id,
    })
    .select("id")
    .single()
  if (taskError) return dbFailure(taskError, "Não foi possível criar a tarefa.")

  const undo = async () => {
    await supabase.from("tasks").delete().eq("id", task.id)
  }
  const assigned = await setAssignees(supabase, task.id, [item.owner_id ?? user.id])
  if (!assigned.ok) {
    await undo()
    return assigned
  }
  const { data: linked, error: linkError } = await supabase
    .from("meeting_items")
    .update({ task_id: task.id })
    .eq("id", itemId)
    .is("task_id", null)
    .select("id")
  if (linkError || linked.length === 0) {
    // Outra pessoa transformou o mesmo combinado ao mesmo tempo.
    await undo()
    if (linkError) return dbFailure(linkError, "Não foi possível criar a tarefa.")
    return { ok: false, error: "Esse combinado já virou tarefa." }
  }

  refreshApp()
  return { ok: true, data: { taskId: task.id } }
}
