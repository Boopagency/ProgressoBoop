import "server-only"

import { fetchEvents } from "@/features/calendar/queries"
import { WEEKLY } from "@/features/calendar/recurrence"
import { parseEventInput } from "@/features/calendar/validation"
import {
  buildAgenda,
  freezeAgenda,
  isMeetingEvent,
  isOccurrenceDate,
  previousRecords,
  recordDate,
  type Agenda,
} from "@/features/meetings/logic"
import { fetchMeetingRecords } from "@/features/meetings/queries"
import {
  parseItemInput,
  parseItemPatch,
  parseLongText,
  SUMMARY_MAX,
  TRANSCRIPT_MAX,
  type MeetingItemInput,
} from "@/features/meetings/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { fetchTasks } from "@/features/tasks/queries"
import { fetchWorkspace } from "@/features/workspace/queries"
import { isDateKey, toDateKey, todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, CalendarEvent, DateKey, MeetingItem, MeetingRecord, MeetingStatus, Task } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações das reuniões, usadas pelas Server Actions e pelo conector do
 * Claude (mesma validação, mesmo RLS). O registro de uma reunião nasce quando
 * alguém a abre (ou adiciona um assunto antes dela); até lá, ela é só um
 * evento no calendário. O banco garante autoria, datas de encerramento e RLS.
 */

function isMeetingStatus(value: unknown): value is MeetingStatus {
  return value === "scheduled" || value === "done" || value === "canceled"
}

export interface LiveAgenda {
  record: MeetingRecord
  event: CalendarEvent
  date: DateKey
  /** Assuntos e combinados desta reunião. */
  items: MeetingItem[]
  agenda: Agenda<Task>
}

/** A pauta montada agora (como a tela mostra a reunião aberta). `null` se o registro não existe. */
export async function liveAgenda(supabase: SupabaseServerClient, id: string, now = new Date()): Promise<LiveAgenda | null> {
  const [events, tasks, workspace, { records, items }] = await Promise.all([
    fetchEvents(supabase),
    fetchTasks(supabase),
    fetchWorkspace(supabase),
    fetchMeetingRecords(supabase),
  ])
  const record = records.find((candidate) => candidate.id === id)
  const eventById = new Map(events.map((event) => [event.id, event]))
  const event = record ? eventById.get(record.event_id) : undefined
  if (!record || !event) return null
  const date = recordDate(record, event)
  return {
    record,
    event,
    date,
    items: items.filter((item) => item.meeting_id === id),
    agenda: buildAgenda({
      event,
      date,
      today: todayKey(now),
      now: now.toISOString(),
      tasks,
      profiles: workspace.profiles,
      projects: workspace.projects,
      previous: previousRecords(event, date, records, eventById),
      previousItems: items,
    }),
  }
}

const MEETING_NOT_FOUND = { ok: false, error: "Essa reunião não existe mais." } as const
const ITEM_NOT_FOUND = { ok: false, error: "Esse item não existe mais." } as const

/**
 * Garante o registro da ocorrência e devolve o id. Confere que o evento é
 * uma reunião e que a data é mesmo uma ocorrência dele.
 */
export async function ensureMeeting(
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

/** Nova reunião: cria o evento no calendário e o registro, e devolve o id do registro. */
export async function insertMeeting(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseEventInput(typeof input === "object" && input !== null ? { ...input, event_type: "meeting" } : input)
  if (!parsed.ok) return parsed

  const { data: event, error } = await supabase.from("events").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar a reunião.")

  const ensured = await ensureMeeting(supabase, event.id, toDateKey(parsed.value.start_at))
  if (!ensured.ok) {
    await supabase.from("events").delete().eq("id", event.id)
    return ensured
  }

  return { ok: true, data: { id: ensured.data.id } }
}

/** Resumo ou transcrição. Salva sem recarregar a tela (o texto já está nela). */
export async function writeMeetingText(
  supabase: SupabaseServerClient,
  id: string,
  field: unknown,
  value: unknown
): Promise<ActionResult> {
  if (!isUuid(id) || (field !== "summary" && field !== "transcript")) return MEETING_NOT_FOUND
  const parsed =
    field === "summary"
      ? parseLongText(value, SUMMARY_MAX, "Resumo")
      : parseLongText(value, TRANSCRIPT_MAX, "Transcrição")
  if (!parsed.ok) return parsed

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
export async function writeMeetingStatus(supabase: SupabaseServerClient, id: string, status: unknown): Promise<ActionResult> {
  if (!isUuid(id) || !isMeetingStatus(status)) return MEETING_NOT_FOUND

  let agenda = null
  if (status === "done") {
    const live = await liveAgenda(supabase, id)
    if (!live) return MEETING_NOT_FOUND
    agenda = freezeAgenda(live.agenda)
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({ status, agenda: agenda ? JSON.parse(JSON.stringify(agenda)) : null })
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível atualizar a reunião.")
  if (data.length === 0) return MEETING_NOT_FOUND

  return { ok: true, data: null }
}

/** Apaga o registro (assuntos, combinados, resumo e transcrição). O evento continua no calendário. */
export async function removeMeeting(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return MEETING_NOT_FOUND

  const { data, error } = await supabase.from("meetings").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o registro.")
  if (data.length === 0) return MEETING_NOT_FOUND

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

export async function insertMeetingItem(
  supabase: SupabaseServerClient,
  meetingId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(meetingId)) return MEETING_NOT_FOUND
  const parsed = parseItemInput(input)
  if (!parsed.ok) return parsed
  return insertItem(supabase, meetingId, parsed.value)
}

/** Assunto para uma reunião que ainda não foi aberta (cria o registro dela). */
export async function insertOccurrenceItem(
  supabase: SupabaseServerClient,
  eventId: string,
  date: unknown,
  input: unknown
): Promise<ActionResult<{ id: string; meetingId: string }>> {
  if (!isUuid(eventId) || !isDateKey(date)) return MEETING_NOT_FOUND
  const parsed = parseItemInput(input)
  if (!parsed.ok) return parsed

  const ensured = await ensureMeeting(supabase, eventId, date)
  if (!ensured.ok) return ensured
  const result = await insertItem(supabase, ensured.data.id, parsed.value)
  if (!result.ok) return result

  return { ok: true, data: { id: result.data.id, meetingId: ensured.data.id } }
}

export async function patchMeetingItem(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return ITEM_NOT_FOUND
  const parsed = parseItemPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }

  const { data, error } = await supabase
    .from("meeting_items")
    .update(parsed.value)
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return ITEM_NOT_FOUND

  return { ok: true, data: null }
}

export async function removeMeetingItem(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return ITEM_NOT_FOUND

  const { data, error } = await supabase.from("meeting_items").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir.")
  if (data.length === 0) return ITEM_NOT_FOUND

  return { ok: true, data: null }
}

const TITLE_MAX = 200

/**
 * Combinado → tarefa, num clique: título = texto do combinado, responsável =
 * dono do combinado (ou quem clicou), prazo e cliente da reunião. A tarefa
 * guarda a reunião de origem e o combinado passa a seguir o status dela.
 */
export async function agreementTask(
  supabase: SupabaseServerClient,
  userId: string,
  itemId: string
): Promise<ActionResult<{ taskId: string }>> {
  if (!isUuid(itemId)) return ITEM_NOT_FOUND

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
  const assigned = await setAssignees(supabase, task.id, [item.owner_id ?? userId])
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

  return { ok: true, data: { taskId: task.id } }
}
