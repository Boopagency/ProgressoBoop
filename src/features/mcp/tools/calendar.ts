import "server-only"

import { insertEvent, patchEvent, removeEvent } from "@/features/calendar/mutations"
import { fetchEvents } from "@/features/calendar/queries"
import { expandEvents, WEEKLY, weeklyRecurrenceLabel } from "@/features/calendar/recurrence"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, findByName, isClear, joinSections, readBoolean, readDate, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf } from "@/features/mcp/queries"
import { CONFIRM, DESTRUCTIVE, EDIT, READ_ONLY, WRITE, confirmFirst, enumOptions, enumValue, findClient, todayLine } from "@/features/mcp/tools/common"
import { fetchMeetingRecords } from "@/features/meetings/queries"
import { addDaysToKey, formatRange, formatShortDate, formatWeekdayShort, isTimeLabel, toDateKey, toTimeLabel, weekRangeOf } from "@/lib/dates"
import { EVENT_TYPES, EVENT_TYPE_LABEL } from "@/lib/labels"
import type { CalendarEvent, DateKey } from "@/lib/types"

/*
 * Agenda (eventos do calendário) pelo conector: listar, criar, editar e
 * excluir. Eventos semanais são editados e excluídos como série. As
 * gravações passam por features/calendar/mutations.ts.
 */

type Args = Record<string, unknown>

function time(args: Args, key: string): Parsed<string | null | undefined> {
  if (!(key in args)) return { ok: true, value: undefined }
  if (isClear(args[key])) return { ok: true, value: null }
  const raw = typeof args[key] === "string" ? (args[key] as string).trim().replace(/h$/i, ":00").replace(/^(\d):/, "0$1:") : ""
  const label = /^\d{1,2}$/.test(raw) ? `${raw.padStart(2, "0")}:00` : raw
  return isTimeLabel(label) ? { ok: true, value: label } : { ok: false, error: `Horário inválido em "${key}": use HH:MM (ex.: 14:30).` }
}

/**
 * Monta a entrada de evento das Server Actions (data e horários de parede
 * em São Paulo). Na edição, o que não veio continua como está.
 */
export async function readEventInput(args: Args, context: McpContext, current: CalendarEvent | null): Promise<Parsed<Record<string, unknown>>> {
  const date = readDate(args, "data", context.today)
  if (!date.ok) return date
  const start = time(args, "inicio")
  if (!start.ok) return start
  const end = time(args, "fim")
  if (!end.ok) return end

  let clientId = current?.client_id ?? null
  if ("cliente" in args) {
    if (isClear(args.cliente)) clientId = null
    else {
      const found = findClient(await loadDirectory(context.supabase), String(args.cliente))
      if (!found.ok) return found
      clientId = found.value.id
    }
  }
  let eventType = current?.event_type ?? "internal"
  if ("tipo" in args) {
    const raw = readText(args, "tipo", 40)
    const found = enumValue(raw.ok ? raw.value : null, EVENT_TYPES, EVENT_TYPE_LABEL)
    if (!found) return { ok: false, error: `Tipo inválido. Opções: ${EVENT_TYPES.map((type) => EVENT_TYPE_LABEL[type]).join(", ")}.` }
    eventType = found
  }

  const currentStart = current && !current.all_day ? toTimeLabel(current.start_at) : null
  const currentEnd = current && !current.all_day && current.end_at ? toTimeLabel(current.end_at) : null
  const startTime = start.value === undefined ? currentStart : start.value
  const endTime = end.value === undefined ? (start.value === undefined ? currentEnd : null) : end.value
  return {
    ok: true,
    value: {
      title: "titulo" in args ? args.titulo : (current?.title ?? ""),
      description: "descricao" in args ? (isClear(args.descricao) ? null : args.descricao) : (current?.description ?? null),
      event_type: eventType,
      date: date.value ?? (current ? toDateKey(current.start_at) : null),
      all_day: startTime === null,
      start_time: startTime,
      end_time: startTime === null ? null : endTime,
      recurrence_rule: "semanal" in args ? (readBoolean(args, "semanal") ? WEEKLY : null) : (current?.recurrence_rule ?? null),
      client_id: clientId,
    },
  }
}

const EVENT_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  tipo: { type: "string", enum: enumOptions(EVENT_TYPES, EVENT_TYPE_LABEL), description: "Padrão: evento interno." },
  data: { type: "string", description: "Dia: aaaa-mm-dd, \"hoje\", \"amanhã\" ou dd/mm. Num evento semanal, o primeiro dia da série." },
  inicio: { type: "string", description: "Horário de início (HH:MM). \"nenhum\" = dia inteiro." },
  fim: { type: "string", description: "Horário de término (HH:MM), opcional." },
  semanal: { type: "boolean", description: "Repete toda semana no mesmo dia e horário." },
  cliente: { type: "string", description: "Nome (ou id) do cliente. \"nenhum\" tira." },
  descricao: { type: "string", maxLength: 5000 },
} as const

/** "toda segunda-feira às 07:00" ou "15/10 às 10:00", para diferenciar eventos de mesmo nome. */
export function eventWhen(event: CalendarEvent, today: DateKey): string {
  if (event.recurrence_rule === WEEKLY) return weeklyRecurrenceLabel(event)
  return `${formatShortDate(toDateKey(event.start_at), today)}${event.all_day ? "" : ` às ${toTimeLabel(event.start_at)}`}`
}

function findEvent(events: CalendarEvent[], query: string, today: DateKey): Parsed<CalendarEvent> {
  return findByName(events, query, (event) => event.title, (event) => event.id, "evento", (event) => eventWhen(event, today))
}

/* ------------------------------------------------------------------ */
/* Listar                                                              */
/* ------------------------------------------------------------------ */

const listEvents: Tool<McpContext> = {
  name: "agenda",
  title: "Agenda",
  description:
    "Eventos do calendário (reuniões, eventos internos e entregas) num período, dia a dia, com os semanais repetidos. Por padrão, a semana atual (segunda a domingo). Cada evento vem com o id.",
  inputSchema: {
    type: "object",
    properties: {
      de: { type: "string", description: "Primeiro dia (aaaa-mm-dd). Sem isso, a segunda desta semana." },
      ate: { type: "string", description: "Último dia (aaaa-mm-dd). Sem isso, 6 dias depois de `de`. No máximo 62 dias." },
      cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só os eventos dele." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const from = readDate(args, "de", today)
    if (!from.ok) return toolError(from.error)
    const to = readDate(args, "ate", today)
    if (!to.ok) return toolError(to.error)
    const start = from.value ?? weekRangeOf(today).start
    const end = to.value ?? addDaysToKey(start, 6)
    if (end < start || end > addDaysToKey(start, 62)) return toolError("Período inválido: `ate` entre `de` e 62 dias depois.")

    const [directory, events] = await Promise.all([loadDirectory(supabase), fetchEvents(supabase)])
    const names = namesOf(directory)
    let shown = events
    if ("cliente" in args && !isClear(args.cliente)) {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return toolError(client.error)
      shown = events.filter((event) => event.client_id === client.value.id)
    }

    const range = { start, end }
    const days = new Map<string, string[]>()
    for (const occurrence of expandEvents(shown, range)) {
      const line = bullet(
        occurrence.startTime ? `${occurrence.startTime}${occurrence.endTime ? `–${occurrence.endTime}` : ""}` : "dia inteiro",
        occurrence.event.title,
        EVENT_TYPE_LABEL[occurrence.event.event_type],
        names.client(occurrence.event.client_id),
        occurrence.event.recurrence_rule === WEEKLY ? weeklyRecurrenceLabel(occurrence.event) : null,
        `id ${occurrence.event.id}`
      )
      days.set(occurrence.date, [...(days.get(occurrence.date) ?? []), line])
    }
    const body = joinSections(
      ...[...days.entries()].map(([day, lines]) => section(`${formatWeekdayShort(day)} ${formatShortDate(day, today)}${day === today ? " (hoje)" : ""}`, lines))
    )
    return textResult(`Agenda de ${formatRange(range)}. ${todayLine(context)}\n\n${body || "Nenhum evento."}\n\nNo Boop Admin: ${origin}/calendario`)
  },
}

/* ------------------------------------------------------------------ */
/* Criar, editar, excluir                                              */
/* ------------------------------------------------------------------ */

const createEvent: Tool<McpContext> = {
  name: "criar_evento",
  title: "Criar evento",
  description: "Cria um evento no calendário (evento interno, entrega ou reunião). Para reunião com pauta, prefira agendar_reuniao, que já abre o registro.",
  inputSchema: { type: "object", properties: EVENT_FIELDS, required: ["titulo", "data"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const input = await readEventInput(args, context, null)
    if (!input.ok) return toolError(input.error)
    const created = await insertEvent(context.supabase, input.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Evento "${String(input.value.title)}" criado em ${String(input.value.date)} · id ${created.data.id}\n${context.origin}/calendario`)
  },
}

const editEvent: Tool<McpContext> = {
  name: "editar_evento",
  title: "Editar evento",
  description: "Muda um evento do calendário (só os campos informados). Num evento semanal, muda a série inteira.",
  inputSchema: {
    type: "object",
    properties: { evento: { type: "string", description: "Id (de preferência) ou título do evento." }, ...EVENT_FIELDS },
    required: ["evento"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "evento", 200)
    if (!query.ok) return toolError(query.error)
    const found = findEvent(await fetchEvents(context.supabase), query.value, context.today)
    if (!found.ok) return toolError(found.error)
    const input = await readEventInput(args, context, found.value)
    if (!input.ok) return toolError(input.error)
    const saved = await patchEvent(context.supabase, found.value.id, input.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Evento "${String(input.value.title)}" salvo.\n${context.origin}/calendario`)
  },
}

const deleteEvent: Tool<McpContext> = {
  name: "excluir_evento",
  title: "Excluir evento",
  description:
    "Exclui um evento do calendário (num evento semanal, a série inteira). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: {
    type: "object",
    properties: { evento: { type: "string", description: "Id (de preferência) ou título do evento." }, confirmar: CONFIRM },
    required: ["evento"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "evento", 200)
    if (!query.ok) return toolError(query.error)
    const [events, { records }] = await Promise.all([fetchEvents(context.supabase), fetchMeetingRecords(context.supabase)])
    const found = findEvent(events, query.value, context.today)
    if (!found.ok) return toolError(found.error)
    const event = found.value
    const own = records.filter((record) => record.event_id === event.id)

    const pending = confirmFirst(args, `o evento "${event.title}" (id ${event.id})`, [
      event.recurrence_rule === WEEKLY ? `É semanal (${weeklyRecurrenceLabel(event)}): todas as ocorrências somem.` : `Dia ${formatShortDate(toDateKey(event.start_at), context.today)}.`,
      own.length > 0
        ? `${count(own.length, "registro de reunião vai junto", "registros de reunião vão junto")}, com pauta guardada, assuntos, combinados, resumo e transcrição. As tarefas criadas de combinados continuam.`
        : "Não há registro de reunião ligado.",
    ])
    if (pending) return pending

    const removed = await removeEvent(context.supabase, event.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Evento "${event.title}" excluído.`)
  },
}

export const CALENDAR_TOOLS = [listEvents, createEvent, editEvent, deleteEvent]
