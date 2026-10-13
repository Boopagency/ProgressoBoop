import "server-only"

import { fetchEvents } from "@/features/calendar/queries"
import { expandEvents } from "@/features/calendar/recurrence"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, excerpt, findByName, isClear, joinSections, readBoolean, readDate, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Names } from "@/features/mcp/queries"
import { CONFIRM, DESTRUCTIVE, EDIT, READ_ONLY, WRITE, confirmFirst, findClient, findPerson, limited, readOptionalDate, todayLine } from "@/features/mcp/tools/common"
import { readEventInput } from "@/features/mcp/tools/calendar"
import {
  MEETING_KIND_LABEL,
  agreementStatus,
  isMeetingEvent,
  isOccurrenceDate,
  meetingKind,
  meetingsOverview,
  recordDate,
  recordFor,
  type Agenda,
  type AgendaTask,
  type MeetingEntry,
  type TaskLists,
} from "@/features/meetings/logic"
import {
  agreementTask,
  ensureMeeting,
  insertMeeting,
  insertMeetingItem,
  insertOccurrenceItem,
  liveAgenda,
  patchMeetingItem,
  removeMeetingItem,
  writeMeetingStatus,
  writeMeetingText,
} from "@/features/meetings/mutations"
import { fetchMeetingDetail, fetchMeetingRecords } from "@/features/meetings/queries"
import { fetchTasks } from "@/features/tasks/queries"
import { addDaysToKey, formatShortDate, formatWeekdayShort, toDateKey } from "@/lib/dates"
import { MEETING_STATUS_LABEL } from "@/lib/labels"
import { foldText } from "@/lib/text"
import type { CalendarEvent, DateKey, MeetingItem, MeetingRecord, MeetingStatus } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Reuniões pelo conector: listar, ver a pauta montada, abrir, agendar,
 * assuntos e combinados (com responsável e prazo; combinado vira tarefa),
 * resumo e transcrição, encerrar. As gravações passam por
 * features/meetings/mutations.ts, as mesmas das Server Actions.
 */

type Args = Record<string, unknown>

const MEETING_ARG = {
  type: "string",
  description: "Id do registro da reunião (de reunioes), id do evento ou o título da reunião.",
} as const
const DATE_ARG = {
  type: "string",
  description: "Dia da ocorrência (aaaa-mm-dd), para reuniões semanais. Sem isso: a próxima a partir de hoje.",
} as const

interface MeetingTarget {
  event: CalendarEvent
  date: DateKey
  record: MeetingRecord | null
}

/**
 * A reunião que o Claude indicou: pelo id do registro, ou pelo evento (id,
 * título ou cliente) e a data da ocorrência.
 */
async function resolveMeeting(args: Args, context: McpContext): Promise<Parsed<MeetingTarget>> {
  const { supabase, today } = context
  const query = readRequiredText(args, "reuniao", 200)
  if (!query.ok) return query
  const dateArg = readDate(args, "data", today)
  if (!dateArg.ok) return dateArg

  const [events, { records }] = await Promise.all([fetchEvents(supabase), fetchMeetingRecords(supabase)])
  const eventById = new Map(events.map((event) => [event.id, event]))
  if (isUuid(query.value)) {
    const record = records.find((candidate) => candidate.id === query.value.toLowerCase())
    const event = record ? eventById.get(record.event_id) : undefined
    if (record && event) return { ok: true, value: { event, record, date: recordDate(record, event) } }
  }

  const meetings = events.filter(isMeetingEvent)
  let found = findByName(meetings, query.value, (event) => event.title, (event) => event.id, "reunião")
  if (!found.ok && !isUuid(query.value)) {
    // "a reunião da Velmont": pelo cliente.
    const directory = await loadDirectory(supabase)
    const client = findClient(directory, query.value)
    const ofClient = client.ok ? meetings.filter((event) => event.client_id === client.value.id) : []
    if (ofClient.length === 1) found = { ok: true, value: ofClient[0]! }
    else if (ofClient.length > 1) {
      return { ok: false, error: `Mais de uma reunião com ${client.ok ? client.value.name : "esse cliente"}: ${ofClient.map((event) => event.title).join(", ")}. Diga qual.` }
    }
  }
  if (!found.ok) return found
  const event = found.value

  let date = dateArg.value
  if (!date) {
    const next = expandEvents([event], { start: today, end: addDaysToKey(today, 120) })[0]
    date = next?.date ?? toDateKey(event.start_at)
  }
  if (!isOccurrenceDate(event, date)) return { ok: false, error: `"${event.title}" não acontece em ${formatShortDate(date, today)} (${date}).` }
  return { ok: true, value: { event, date, record: recordFor(records, event, date) } }
}

function meetingTitle(target: MeetingTarget, names: Names, today: DateKey): string {
  return [
    `"${target.event.title}"`,
    `${formatWeekdayShort(target.date)} ${formatShortDate(target.date, today)} (${target.date})`,
    MEETING_KIND_LABEL[meetingKind(target.event)],
    names.client(target.event.client_id),
  ]
    .filter(Boolean)
    .join(" · ")
}

/* ------------------------------------------------------------------ */
/* Listar e ver                                                        */
/* ------------------------------------------------------------------ */

function entryLine(entry: MeetingEntry, names: Names, today: DateKey): string {
  return bullet(
    `${formatWeekdayShort(entry.date)} ${formatShortDate(entry.date, today)}${entry.startTime ? ` ${entry.startTime}` : ""}`,
    entry.event.title,
    MEETING_KIND_LABEL[meetingKind(entry.event)],
    names.client(entry.event.client_id),
    entry.record ? MEETING_STATUS_LABEL[entry.record.status] : "ainda não aberta",
    entry.record ? `id ${entry.record.id}` : `evento ${entry.event.id} · data ${entry.date}`
  )
}

const listMeetings: Tool<McpContext> = {
  name: "reunioes",
  title: "Reuniões",
  description:
    "Próximas reuniões (4 semanas) e as recentes (3 semanas), com tipo (Weekly, Cliente, Interna), cliente e situação. As já abertas vêm com o id do registro; as outras, com o id do evento e a data.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só as reuniões dele." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const [directory, events, { records }] = await Promise.all([loadDirectory(supabase), fetchEvents(supabase), fetchMeetingRecords(supabase)])
    const names = namesOf(directory)
    let overview = meetingsOverview(events, records, today)
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    if (clientArg.value) {
      const client = findClient(directory, clientArg.value)
      if (!client.ok) return toolError(client.error)
      const only = (entries: MeetingEntry[]) => entries.filter((entry) => entry.event.client_id === client.value.id)
      overview = { upcoming: only(overview.upcoming), history: only(overview.history) }
    }
    return textResult(
      `${todayLine(context)}\n\n${
        joinSections(
          section(`Próximas (${overview.upcoming.length})`, limited(overview.upcoming.map((entry) => entryLine(entry, names, today)))),
          section(`Recentes (${overview.history.length})`, limited(overview.history.map((entry) => entryLine(entry, names, today)), 20))
        ) || "Nenhuma reunião."
      }\n\nNo Boop Admin: ${origin}/reunioes`
    )
  },
}

function agendaTaskLine(task: AgendaTask, names: Names, today: DateKey, withPeople: boolean): string {
  return bullet(
    task.title,
    task.completed_at ? `concluída ${formatShortDate(toDateKey(task.completed_at), today)}` : task.due_date ? `prazo ${formatShortDate(task.due_date, today)}` : null,
    withPeople ? task.assignee_ids.map((id) => names.person(id)).filter(Boolean).join(", ") : null,
    `id ${task.id}`
  )
}

function listsText(lists: TaskLists<AgendaTask>, agenda: Agenda, names: Names, today: DateKey, withPeople: boolean): string[] {
  const line = (task: AgendaTask) => `  ${agendaTaskLine(task, names, today, withPeople)}`
  return [
    lists.overdue.length > 0 ? `  Atrasadas (${lists.overdue.length}):\n${lists.overdue.map(line).join("\n")}` : null,
    lists.upcoming.length > 0 ? `  Até ${formatShortDate(agenda.until, today)} (${lists.upcoming.length}):\n${lists.upcoming.map(line).join("\n")}` : null,
    lists.completed.length > 0
      ? `  Concluídas desde ${formatShortDate(agenda.since, today)} (${lists.completed.length}):\n${lists.completed.map(line).join("\n")}`
      : null,
  ].filter((part): part is string => part !== null)
}

function agendaText(agenda: Agenda, names: Names, today: DateKey): string {
  const projects = (agenda.projects ?? []).map((project) =>
    bullet(project.name, `${project.done} de ${project.total} tarefas`, project.overdue ? count(project.overdue, "atrasada", "atrasadas") : null)
  )
  const people = agenda.people.map((person) => {
    const parts = listsText(person, agenda, names, today, false)
    return `- ${names.person(person.profile_id) ?? "?"}${parts.length > 0 ? `\n${parts.join("\n")}` : ": nada pendente"}`
  })
  const agreements = agenda.agreements.map((item) =>
    bullet(
      item.content,
      names.person(item.owner_id) ?? null,
      item.due_date ? `prazo ${formatShortDate(item.due_date, today)}` : null,
      item.status === "done" ? "cumprido" : item.status === "doing" ? "em andamento" : "em aberto",
      `combinado em ${formatShortDate(item.agreed_on, today)}`
    )
  )
  return joinSections(
    section("Projetos em foco", projects),
    section("Por pessoa", people),
    agenda.client ? section("Tarefas do cliente", listsText(agenda.client, agenda, names, today, true)) : null,
    section("Combinados anteriores", agreements)
  )
}

function itemLine(item: MeetingItem, names: Names, today: DateKey, taskStatus: ReadonlyMap<string, { status: "todo" | "doing" | "done" }>): string {
  const status = item.kind === "agreement" ? agreementStatus(item, taskStatus) : item.done ? "done" : "open"
  return bullet(
    item.content,
    names.person(item.owner_id) ?? null,
    item.due_date ? `prazo ${formatShortDate(item.due_date, today)}` : null,
    item.kind === "agreement" ? (status === "done" ? "cumprido" : status === "doing" ? "em andamento" : "em aberto") : item.done ? "discutido" : null,
    item.task_id ? `virou tarefa ${item.task_id}` : null,
    `item ${item.id}`
  )
}

const viewMeeting: Tool<McpContext> = {
  name: "ver_reuniao",
  title: "Ver reunião",
  description:
    "Uma reunião aberta: a pauta montada (Weekly: projetos em foco e as tarefas de cada pessoa; Cliente: as tarefas do cliente; combinados anteriores), os assuntos e combinados desta reunião (com id de cada item), o resumo e, se pedir, a transcrição. Encerrada: a pauta como estava ao encerrar.",
  inputSchema: {
    type: "object",
    properties: {
      reuniao: MEETING_ARG,
      data: DATE_ARG,
      incluir_transcricao: { type: "boolean", description: "Também devolver a transcrição inteira." },
    },
    required: ["reuniao"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const target = await resolveMeeting(args, context)
    if (!target.ok) return toolError(target.error)
    const directory = await loadDirectory(supabase)
    const names = namesOf(directory)
    const { record } = target.value
    if (!record) {
      return textResult(
        `${meetingTitle(target.value, names, today)}: ainda não foi aberta (sem pauta registrada). Para abrir, abrir_reuniao com reuniao "${target.value.event.id}" e data ${target.value.date}; adicionar_na_pauta também abre.`
      )
    }

    const [detail, live, tasks] = await Promise.all([
      fetchMeetingDetail(supabase, record.id),
      liveAgenda(supabase, record.id),
      fetchTasks(supabase),
    ])
    if (!detail || !live) return toolError("Essa reunião não existe mais.")
    const frozen = record.status !== "scheduled" && detail.agenda
    const agenda: Agenda = frozen ? detail.agenda! : live.agenda
    const taskStatus = new Map(tasks.map((task) => [task.id, task]))
    const topics = live.items.filter((item) => item.kind === "topic").map((item) => itemLine(item, names, today, taskStatus))
    const agreements = live.items.filter((item) => item.kind === "agreement").map((item) => itemLine(item, names, today, taskStatus))

    return textResult(
      joinSections(
        `Reunião ${meetingTitle(target.value, names, today)} · ${MEETING_STATUS_LABEL[record.status]} · id ${record.id}`,
        meetingKind(target.value.event) === "internal"
          ? null
          : `Pauta ${frozen ? "guardada ao encerrar" : "montada agora"}:\n${agendaText(agenda, names, today) || "nada pendente"}`,
        section(`Assuntos (${topics.length})`, topics),
        section(`Combinados (${agreements.length})`, agreements),
        detail.record.summary ? `Resumo:\n${detail.record.summary}` : "Sem resumo.",
        readBoolean(args, "incluir_transcricao") && detail.transcript
          ? `Transcrição:\n${detail.transcript}`
          : detail.transcript
            ? `Transcrição: ${count(detail.transcript.length, "caractere", "caracteres")} (peça com incluir_transcricao).`
            : null
      ) + `\n\n${origin}/reunioes/${record.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Abrir, agendar                                                      */
/* ------------------------------------------------------------------ */

const openMeeting: Tool<McpContext> = {
  name: "abrir_reuniao",
  title: "Abrir reunião",
  description: "Abre uma reunião do calendário (cria o registro dela, onde ficam pauta, assuntos, combinados e resumo) e devolve o id. Se já estava aberta, só devolve o id.",
  inputSchema: { type: "object", properties: { reuniao: MEETING_ARG, data: DATE_ARG }, required: ["reuniao"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const target = await resolveMeeting(args, context)
    if (!target.ok) return toolError(target.error)
    const ensured = await ensureMeeting(context.supabase, target.value.event.id, target.value.date)
    if (!ensured.ok) return toolError(ensured.error)
    const names = namesOf(await loadDirectory(context.supabase))
    return textResult(
      `Reunião ${meetingTitle(target.value, names, context.today)} aberta · id ${ensured.data.id}\n${context.origin}/reunioes/${ensured.data.id}`
    )
  },
}

const scheduleMeeting: Tool<McpContext> = {
  name: "agendar_reuniao",
  title: "Agendar reunião",
  description: "Cria uma reunião no calendário (única ou semanal, com ou sem cliente) e já abre o registro dela. Para outros tipos de evento, criar_evento.",
  inputSchema: {
    type: "object",
    properties: {
      titulo: { type: "string", maxLength: 200 },
      data: { type: "string", description: "Dia: aaaa-mm-dd, \"hoje\", \"amanhã\" ou dd/mm." },
      inicio: { type: "string", description: "Horário de início (HH:MM). Sem isso, dia inteiro." },
      fim: { type: "string", description: "Horário de término (HH:MM), opcional." },
      semanal: { type: "boolean", description: "Repete toda semana no mesmo dia e horário." },
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      descricao: { type: "string", maxLength: 5000 },
    },
    required: ["titulo", "data"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const input = await readEventInput(args, context, null)
    if (!input.ok) return toolError(input.error)
    const created = await insertMeeting(context.supabase, input.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Reunião "${String(input.value.title)}" agendada para ${String(input.value.date)} · id ${created.data.id}\n${context.origin}/reunioes/${created.data.id}`)
  },
}

/* ------------------------------------------------------------------ */
/* Assuntos e combinados                                               */
/* ------------------------------------------------------------------ */

const ITEM_KINDS: Record<string, "topic" | "agreement"> = { assunto: "topic", topico: "topic", pauta: "topic", combinado: "agreement" }

function readItemFields(args: Args, context: McpContext, directory: Awaited<ReturnType<typeof loadDirectory>>): Parsed<Record<string, unknown>> {
  const fields: Record<string, unknown> = {}
  if ("texto" in args) fields.content = args.texto
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) fields.owner_id = null
    else {
      const person = findPerson(directory, String(args.responsavel), context.user.id)
      if (!person.ok) return person
      fields.owner_id = person.value.id
    }
  }
  const due = readOptionalDate(args, "prazo", context.today)
  if (!due.ok) return due
  if (due.value !== undefined) fields.due_date = due.value
  if ("feito" in args) fields.done = readBoolean(args, "feito")
  return { ok: true, value: fields }
}

const addToAgenda: Tool<McpContext> = {
  name: "adicionar_na_pauta",
  title: "Adicionar na pauta",
  description:
    "Adiciona um assunto à pauta de uma reunião ou registra um combinado (com responsável e prazo). Funciona também antes da reunião: abre o registro dela.",
  inputSchema: {
    type: "object",
    properties: {
      reuniao: MEETING_ARG,
      data: DATE_ARG,
      tipo: { type: "string", enum: ["assunto", "combinado"], description: "Padrão: assunto." },
      texto: { type: "string", maxLength: 1000 },
      responsavel: { type: "string", description: "Pessoa da equipe (combinados)." },
      prazo: { type: "string", description: "Prazo do combinado: aaaa-mm-dd ou dd/mm." },
    },
    required: ["reuniao", "texto"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, origin, today } = context
    const kindArg = readText(args, "tipo", 20)
    const kind = ITEM_KINDS[foldText((kindArg.ok ? kindArg.value : null) ?? "assunto")]
    if (!kind) return toolError("Tipo inválido: assunto ou combinado.")
    const target = await resolveMeeting(args, context)
    if (!target.ok) return toolError(target.error)
    const directory = await loadDirectory(supabase)
    const fields = readItemFields(args, context, directory)
    if (!fields.ok) return toolError(fields.error)
    const input = { kind, ...fields.value }

    const saved = target.value.record
      ? await insertMeetingItem(supabase, target.value.record.id, input)
      : await insertOccurrenceItem(supabase, target.value.event.id, target.value.date, input)
    if (!saved.ok) return toolError(saved.error)
    const meetingId = "meetingId" in saved.data ? saved.data.meetingId : target.value.record!.id
    return textResult(
      `${kind === "topic" ? "Assunto adicionado" : "Combinado registrado"} em ${meetingTitle(target.value, namesOf(directory), today)} · item ${saved.data.id}\n${origin}/reunioes/${meetingId}`
    )
  },
}

async function findItem(context: McpContext, raw: unknown): Promise<Parsed<MeetingItem>> {
  if (!isUuid(raw)) return { ok: false, error: "Informe o id do item (vem em ver_reuniao)." }
  const { items } = await fetchMeetingRecords(context.supabase)
  const item = items.find((candidate) => candidate.id === raw.toLowerCase())
  return item ? { ok: true, value: item } : { ok: false, error: "Esse item não existe mais." }
}

const ITEM_ARG = { type: "string", description: "Id do assunto ou combinado (vem em ver_reuniao)." } as const

const editItem: Tool<McpContext> = {
  name: "editar_item_da_reuniao",
  title: "Editar assunto ou combinado",
  description: "Muda um assunto ou combinado de reunião: texto, responsável, prazo, ou marca como discutido/cumprido (feito).",
  inputSchema: {
    type: "object",
    properties: {
      item: ITEM_ARG,
      texto: { type: "string", maxLength: 1000 },
      responsavel: { type: "string", description: "Pessoa da equipe. \"nenhum\" tira." },
      prazo: { type: "string", description: "aaaa-mm-dd ou dd/mm. \"nenhum\" tira." },
      feito: { type: "boolean", description: "Assunto discutido ou combinado cumprido." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const item = await findItem(context, args.item)
    if (!item.ok) return toolError(item.error)
    const fields = readItemFields(args, context, await loadDirectory(context.supabase))
    if (!fields.ok) return toolError(fields.error)
    if (Object.keys(fields.value).length === 0) return toolError("Diga o que mudar (texto, responsavel, prazo ou feito).")
    const saved = await patchMeetingItem(context.supabase, item.value.id, fields.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Item salvo: "${excerpt(String(fields.value.content ?? item.value.content), 120)}".`)
  },
}

const deleteItem: Tool<McpContext> = {
  name: "excluir_item_da_reuniao",
  title: "Excluir assunto ou combinado",
  description: "Exclui um assunto ou combinado de reunião. Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { item: ITEM_ARG, confirmar: CONFIRM }, required: ["item"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const item = await findItem(context, args.item)
    if (!item.ok) return toolError(item.error)
    const pending = confirmFirst(args, `o ${item.value.kind === "topic" ? "assunto" : "combinado"} "${excerpt(item.value.content, 120)}"`, [
      item.value.task_id ? "A tarefa criada a partir dele continua." : "Nada mais vai junto.",
    ])
    if (pending) return pending
    const removed = await removeMeetingItem(context.supabase, item.value.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult("Item excluído.")
  },
}

const agreementToTask: Tool<McpContext> = {
  name: "combinado_vira_tarefa",
  title: "Combinado vira tarefa",
  description:
    "Transforma um combinado de reunião em tarefa: título = texto do combinado, responsável = dono do combinado (ou você), prazo e cliente da reunião. O combinado passa a seguir o status da tarefa.",
  inputSchema: { type: "object", properties: { item: ITEM_ARG }, required: ["item"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const item = await findItem(context, args.item)
    if (!item.ok) return toolError(item.error)
    const created = await agreementTask(context.supabase, context.user.id, item.value.id)
    if (!created.ok) return toolError(created.error)
    return textResult(`Combinado virou a tarefa ${created.data.taskId}.\n${context.origin}/tarefas?tarefa=${created.data.taskId}`)
  },
}

/* ------------------------------------------------------------------ */
/* Resumo e encerramento                                               */
/* ------------------------------------------------------------------ */

async function openRecord(args: Args, context: McpContext): Promise<Parsed<MeetingTarget & { record: MeetingRecord }>> {
  const target = await resolveMeeting(args, context)
  if (!target.ok) return target
  if (!target.value.record) return { ok: false, error: `Essa reunião ainda não foi aberta. Use abrir_reuniao antes.` }
  return { ok: true, value: { ...target.value, record: target.value.record } }
}

const saveSummary: Tool<McpContext> = {
  name: "salvar_resumo_da_reuniao",
  title: "Salvar resumo ou transcrição",
  description: "Grava o resumo e/ou a transcrição de uma reunião aberta (substitui o que havia). \"nenhum\" apaga o texto.",
  inputSchema: {
    type: "object",
    properties: {
      reuniao: MEETING_ARG,
      data: DATE_ARG,
      resumo: { type: "string", maxLength: 20000 },
      transcricao: { type: "string", maxLength: 200000 },
    },
    required: ["reuniao"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    if (!("resumo" in args) && !("transcricao" in args)) return toolError("Informe resumo e/ou transcricao.")
    const target = await openRecord(args, context)
    if (!target.ok) return toolError(target.error)
    for (const [key, field] of [["resumo", "summary"], ["transcricao", "transcript"]] as const) {
      if (!(key in args)) continue
      const saved = await writeMeetingText(context.supabase, target.value.record.id, field, isClear(args[key]) ? null : args[key])
      if (!saved.ok) return toolError(saved.error)
    }
    return textResult(`Salvo em "${target.value.event.title}".\n${context.origin}/reunioes/${target.value.record.id}`)
  },
}

const STATUS_WORDS: Record<string, MeetingStatus> = { encerrar: "done", cancelar: "canceled", reabrir: "scheduled" }

const closeMeeting: Tool<McpContext> = {
  name: "encerrar_reuniao",
  title: "Encerrar, cancelar ou reabrir reunião",
  description:
    "Encerrar guarda a pauta como está agora (o histórico mostra o que foi discutido). Cancelar marca como cancelada. Reabrir volta para agendada e descarta a pauta guardada.",
  inputSchema: {
    type: "object",
    properties: { reuniao: MEETING_ARG, data: DATE_ARG, acao: { type: "string", enum: Object.keys(STATUS_WORDS), description: "Padrão: encerrar." } },
    required: ["reuniao"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const actionArg = readText(args, "acao", 20)
    const status = STATUS_WORDS[foldText((actionArg.ok ? actionArg.value : null) ?? "encerrar")]
    if (!status) return toolError("Ação inválida: encerrar, cancelar ou reabrir.")
    const target = await openRecord(args, context)
    if (!target.ok) return toolError(target.error)
    const saved = await writeMeetingStatus(context.supabase, target.value.record.id, status)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`"${target.value.event.title}": ${MEETING_STATUS_LABEL[status].toLowerCase()}.\n${context.origin}/reunioes/${target.value.record.id}`)
  },
}

export const MEETING_TOOLS = [
  listMeetings,
  viewMeeting,
  openMeeting,
  scheduleMeeting,
  addToAgenda,
  editItem,
  deleteItem,
  agreementToTask,
  saveSummary,
  closeMeeting,
]
