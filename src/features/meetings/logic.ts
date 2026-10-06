import { expandEvents, WEEKLY } from "@/features/calendar/recurrence"
import {
  compareCompleted,
  compareTasks,
  currentPlan,
  isAssignedTo,
  progressOf,
} from "@/features/tasks/logic"
import { addDaysToKey, daysBetween, isWithin, toDateKey, toTimeLabel, weekRangeOf } from "@/lib/dates"
import type {
  CalendarEvent,
  DateKey,
  MeetingItem,
  MeetingRecord,
  Plan,
  Profile,
  Task,
  TaskArea,
  TaskPriority,
  TaskStatus,
  Timestamp,
} from "@/lib/types"

/**
 * Regras das Reuniões: funções puras, sem React.
 *
 * - Uma reunião é uma ocorrência de um evento do tipo "meeting" (único ou
 *   semanal). O registro (MeetingRecord) guarda o que aconteceu nela e nasce
 *   quando alguém abre a reunião.
 * - Tipo: com cliente → "Cliente"; semanal sem cliente → "Weekly"; o resto
 *   → "Interna".
 * - Série: as ocorrências do mesmo evento semanal ou, em reuniões com
 *   cliente, todas as reuniões com aquele cliente. Os "combinados anteriores"
 *   da pauta vêm da série.
 */

export type MeetingKind = "weekly" | "client" | "internal"

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  weekly: "Weekly",
  client: "Cliente",
  internal: "Interna",
}

export function isMeetingEvent(event: Pick<CalendarEvent, "event_type">): boolean {
  return event.event_type === "meeting"
}

export function meetingKind(event: Pick<CalendarEvent, "client_id" | "recurrence_rule">): MeetingKind {
  if (event.client_id) return "client"
  return event.recurrence_rule === WEEKLY ? "weekly" : "internal"
}

/** A data é uma ocorrência do evento? Semanal: mesmo dia da semana, a partir da primeira. */
export function isOccurrenceDate(event: CalendarEvent, date: DateKey): boolean {
  const first = toDateKey(event.start_at)
  if (event.recurrence_rule !== WEEKLY) return date === first
  return date >= first && daysBetween(first, date) % 7 === 0
}

/* ------------------------------------------------------------------ */
/* Lista de reuniões                                                   */
/* ------------------------------------------------------------------ */

/** Uma reunião na lista: a ocorrência do evento e, se já existir, o registro. */
export interface MeetingEntry {
  /** `${event.id}:${date}` */
  key: string
  event: CalendarEvent
  date: DateKey
  /** "07:00"; `null` para eventos de dia inteiro. */
  startTime: string | null
  endTime: string | null
  record: MeetingRecord | null
}

export function meetingEntry(
  event: CalendarEvent,
  date: DateKey,
  record: MeetingRecord | null
): MeetingEntry {
  return {
    key: `${event.id}:${date}`,
    event,
    date,
    startTime: event.all_day ? null : toTimeLabel(event.start_at),
    endTime: event.all_day || !event.end_at ? null : toTimeLabel(event.end_at),
    record,
  }
}

/** Dia de um registro: em eventos únicos vale a data atual do evento. */
export function recordDate(record: MeetingRecord, event: CalendarEvent): DateKey {
  return event.recurrence_rule === WEEKLY ? record.occurs_on : toDateKey(event.start_at)
}

/** Registro de uma ocorrência. Em eventos únicos, o registro do evento. */
export function recordFor(
  records: MeetingRecord[],
  event: CalendarEvent,
  date: DateKey
): MeetingRecord | null {
  if (event.recurrence_rule !== WEEKLY) {
    return records.find((record) => record.event_id === event.id) ?? null
  }
  return records.find((record) => record.event_id === event.id && record.occurs_on === date) ?? null
}

export function compareEntries(a: MeetingEntry, b: MeetingEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.startTime !== b.startTime) {
    if (a.startTime === null) return -1
    if (b.startTime === null) return 1
    return a.startTime < b.startTime ? -1 : 1
  }
  return a.event.title.localeCompare(b.event.title, "pt-BR")
}

export interface MeetingsOverview {
  /**
   * De hoje em diante, ainda não encerradas (a reunião de hoje fica aqui até
   * alguém encerrar). Inclui as canceladas, que a lista mostra riscadas.
   */
  upcoming: MeetingEntry[]
  /** Encerradas ou passadas, mais as recentes sem registro. Mais novas primeiro. */
  history: MeetingEntry[]
}

export function meetingsOverview(
  events: CalendarEvent[],
  records: MeetingRecord[],
  today: DateKey,
  { horizonDays = 28, lookbackDays = 21 }: { horizonDays?: number; lookbackDays?: number } = {}
): MeetingsOverview {
  const meetingEvents = events.filter(isMeetingEvent)
  const eventById = new Map(events.map((event) => [event.id, event]))
  const listed = new Set<string>()

  const upcoming: MeetingEntry[] = []
  const horizon = { start: today, end: addDaysToKey(today, horizonDays) }
  for (const occurrence of expandEvents(meetingEvents, horizon)) {
    const record = recordFor(records, occurrence.event, occurrence.date)
    if (record?.status === "done") continue
    if (record) listed.add(record.id)
    upcoming.push(meetingEntry(occurrence.event, occurrence.date, record))
  }

  const history: MeetingEntry[] = []
  for (const record of records) {
    if (listed.has(record.id)) continue
    const event = eventById.get(record.event_id)
    if (!event) continue
    const date = recordDate(record, event)
    const entry = meetingEntry(event, date, record)
    if (date > today && record.status !== "done") upcoming.push(entry)
    else history.push(entry)
  }

  // Reuniões recentes que ninguém registrou: dá para registrar depois.
  const lookback = { start: addDaysToKey(today, -lookbackDays), end: addDaysToKey(today, -1) }
  for (const occurrence of expandEvents(meetingEvents, lookback)) {
    if (recordFor(records, occurrence.event, occurrence.date)) continue
    history.push(meetingEntry(occurrence.event, occurrence.date, null))
  }

  upcoming.sort(compareEntries)
  history.sort((a, b) => compareEntries(b, a))
  return { upcoming, history }
}

/** A próxima reunião que vai acontecer (ignora as canceladas). */
export function nextMeeting(overview: MeetingsOverview): MeetingEntry | null {
  return overview.upcoming.find((entry) => entry.record?.status !== "canceled") ?? null
}

/* ------------------------------------------------------------------ */
/* Série e combinados                                                  */
/* ------------------------------------------------------------------ */

/** As duas reuniões são da mesma série (mesmo cliente, ou o mesmo evento semanal)? */
export function sameSeries(reference: CalendarEvent, other: CalendarEvent): boolean {
  if (!isMeetingEvent(other)) return false
  if (reference.client_id) return other.client_id === reference.client_id
  if (reference.recurrence_rule === WEEKLY) return other.id === reference.id
  return false
}

/** Registros anteriores da mesma série, do mais recente para o mais antigo. */
export function previousRecords(
  event: CalendarEvent,
  date: DateKey,
  records: MeetingRecord[],
  eventById: Map<string, CalendarEvent>
): { record: MeetingRecord; date: DateKey }[] {
  return records
    .flatMap((record) => {
      const other = eventById.get(record.event_id)
      if (!other || !sameSeries(event, other)) return []
      const otherDate = recordDate(record, other)
      return otherDate < date ? [{ record, date: otherDate }] : []
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * Reunião anterior e próxima da mesma série, para navegar: registros e
 * ocorrências do calendário (60 dias para trás, 180 para frente).
 */
export function seriesSiblings(
  event: CalendarEvent,
  date: DateKey,
  records: MeetingRecord[],
  events: CalendarEvent[]
): { previous: MeetingEntry | null; next: MeetingEntry | null } {
  const series = events.filter((other) => other.id === event.id || sameSeries(event, other))
  const seriesIds = new Set(series.map((other) => other.id))
  const eventById = new Map(series.map((other) => [other.id, other]))

  const entries = new Map<string, MeetingEntry>()
  for (const record of records) {
    const other = eventById.get(record.event_id)
    if (!other || !seriesIds.has(other.id)) continue
    entries.set(`r:${record.id}`, meetingEntry(other, recordDate(record, other), record))
  }
  const window = { start: addDaysToKey(date, -60), end: addDaysToKey(date, 180) }
  for (const occurrence of expandEvents(series, window)) {
    const record = recordFor(records, occurrence.event, occurrence.date)
    const key = record ? `r:${record.id}` : `${occurrence.event.id}:${occurrence.date}`
    if (!entries.has(key)) entries.set(key, meetingEntry(occurrence.event, occurrence.date, record))
  }

  const all = [...entries.values()].sort(compareEntries)
  return {
    previous: all.filter((entry) => entry.date < date).at(-1) ?? null,
    next: all.find((entry) => entry.date > date) ?? null,
  }
}

export type AgreementStatus = "open" | "doing" | "done"

/** Status do combinado: o da tarefa, quando ele virou tarefa; senão, o próprio. */
export function agreementStatus(
  item: Pick<MeetingItem, "done" | "task_id">,
  taskById: ReadonlyMap<string, Pick<Task, "status">>
): AgreementStatus {
  const task = item.task_id ? taskById.get(item.task_id) : undefined
  if (task) return task.status === "done" ? "done" : task.status === "doing" ? "doing" : "open"
  return item.done ? "done" : "open"
}

/* ------------------------------------------------------------------ */
/* Pauta automática                                                    */
/* ------------------------------------------------------------------ */

/** O que a pauta guarda de cada tarefa (o suficiente para mostrar a linha). */
export interface AgendaTask {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  due_date: DateKey | null
  completed_at: Timestamp | null
  assignee_ids: string[]
  client_id: string | null
  area: TaskArea | null
}

export function toAgendaTask(task: AgendaTask): AgendaTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    completed_at: task.completed_at,
    assignee_ids: task.assignee_ids,
    client_id: task.client_id,
    area: task.area,
  }
}

export interface AgendaAgreement {
  id: string
  meeting_id: string
  /** Dia da reunião em que foi combinado. */
  agreed_on: DateKey
  content: string
  owner_id: string | null
  due_date: DateKey | null
  task_id: string | null
  status: AgreementStatus
}

export interface TaskLists<T> {
  overdue: T[]
  upcoming: T[]
  completed: T[]
}

/**
 * Pauta de uma reunião. Ao vivo, as listas têm as tarefas de verdade (dá
 * para concluir durante a reunião); ao encerrar, a pauta é guardada com
 * `AgendaTask` e passa a mostrar como as coisas estavam naquele momento.
 */
export interface Agenda<T extends AgendaTask = AgendaTask> {
  version: 1
  generated_at: Timestamp
  kind: MeetingKind
  /** "Atrasadas" = prazo antes deste dia. */
  reference: DateKey
  /** Fim do período de "próximas" (inclusive). */
  until: DateKey
  /** Concluídas a partir deste dia (data da reunião anterior). */
  since: DateKey
  plan: { id: string; name: string; done: number; total: number } | null
  /** Weekly: uma entrada por pessoa, na ordem da equipe. */
  people: ({ profile_id: string } & TaskLists<T>)[]
  /** Reunião com cliente: as tarefas daquele cliente. */
  client: TaskLists<T> | null
  /** Da reunião anterior (todos) e das mais antigas (só os em aberto). */
  agreements: AgendaAgreement[]
}

export interface AgendaInput {
  event: CalendarEvent
  /** Dia da reunião. */
  date: DateKey
  today: DateKey
  /** Quando a pauta foi montada (só importa para a pauta guardada). */
  now?: Timestamp
  tasks: Task[]
  profiles: Profile[]
  plans: Plan[]
  /** Reuniões anteriores da série (mais recente primeiro) e seus combinados. */
  previous: { record: MeetingRecord; date: DateKey }[]
  previousItems: MeetingItem[]
  /** Concluídas durante a reunião: continuam na lista em que estavam. */
  keepInPlace?: ReadonlySet<string>
}

const MAX_OLDER_AGREEMENTS = 30

function completedDay(task: AgendaTask): DateKey | null {
  return task.completed_at ? toDateKey(task.completed_at) : null
}

function laterOf(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b
}

function taskLists(
  tasks: Task[],
  range: { reference: DateKey; until: DateKey; since: DateKey },
  keepInPlace: ReadonlySet<string>
): TaskLists<Task> {
  const pending = (task: Task) => task.status !== "done" || keepInPlace.has(task.id)
  return {
    overdue: tasks
      .filter((task) => pending(task) && task.due_date !== null && task.due_date < range.reference)
      .sort(compareTasks),
    upcoming: tasks
      .filter(
        (task) =>
          pending(task) &&
          task.due_date !== null &&
          isWithin(task.due_date, { start: range.reference, end: range.until })
      )
      .sort(compareTasks),
    completed: tasks
      .filter((task) => {
        const day = completedDay(task)
        return (
          task.status === "done" &&
          !keepInPlace.has(task.id) &&
          day !== null &&
          isWithin(day, { start: range.since, end: range.reference })
        )
      })
      .sort(compareCompleted),
  }
}

export function buildAgenda(input: AgendaInput): Agenda<Task> {
  const { event, date, today, tasks, keepInPlace = new Set<string>() } = input
  const kind = meetingKind(event)
  const latest = input.previous[0]
  const since = latest ? latest.date : addDaysToKey(date, -7)
  const reference = today
  // Weekly: até o domingo da semana da reunião. Cliente: pelo menos duas semanas.
  const until = laterOf(
    weekRangeOf(date).end,
    kind === "client" ? addDaysToKey(today, 13) : today
  )
  const range = { reference, until, since }

  let plan: Agenda["plan"] = null
  let people: Agenda<Task>["people"] = []
  let client: Agenda<Task>["client"] = null

  if (kind === "weekly") {
    const current = currentPlan(input.plans, today)
    if (current) {
      const progress = progressOf(tasks.filter((task) => task.plan_id === current.id))
      plan = { id: current.id, name: current.name, done: progress.done, total: progress.total }
    }
    people = input.profiles.map((profile) => ({
      profile_id: profile.id,
      ...taskLists(
        tasks.filter((task) => isAssignedTo(task, profile.id)),
        range,
        keepInPlace
      ),
    }))
  } else if (kind === "client") {
    client = taskLists(
      tasks.filter((task) => task.client_id === event.client_id),
      range,
      keepInPlace
    )
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const dateByMeeting = new Map(input.previous.map((entry) => [entry.record.id, entry.date]))
  const agreements: AgendaAgreement[] = []
  let older = 0
  for (const entry of input.previous) {
    const isLatest = entry === latest
    const items = input.previousItems.filter(
      (item) => item.meeting_id === entry.record.id && item.kind === "agreement"
    )
    for (const item of items) {
      const status = agreementStatus(item, taskById)
      if (!isLatest && status === "done") continue
      if (!isLatest) {
        if (older >= MAX_OLDER_AGREEMENTS) continue
        older += 1
      }
      agreements.push({
        id: item.id,
        meeting_id: item.meeting_id,
        agreed_on: dateByMeeting.get(item.meeting_id) ?? entry.date,
        content: item.content,
        owner_id: item.owner_id,
        due_date: item.due_date,
        task_id: item.task_id,
        status,
      })
    }
  }
  // Em aberto primeiro (prazo mais próximo antes), depois os cumpridos.
  agreements.sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date < b.due_date ? -1 : 1
    }
    return a.agreed_on < b.agreed_on ? 1 : a.agreed_on > b.agreed_on ? -1 : 0
  })

  return {
    version: 1,
    generated_at: input.now ?? "",
    kind,
    reference,
    until,
    since,
    plan,
    people,
    client,
    agreements,
  }
}

/** Pauta pronta para guardar: só os campos necessários de cada tarefa. */
export function freezeAgenda(agenda: Agenda<Task>): Agenda {
  const freeze = (lists: TaskLists<Task>): TaskLists<AgendaTask> => ({
    overdue: lists.overdue.map(toAgendaTask),
    upcoming: lists.upcoming.map(toAgendaTask),
    completed: lists.completed.map(toAgendaTask),
  })
  return {
    ...agenda,
    people: agenda.people.map((person) => ({ profile_id: person.profile_id, ...freeze(person) })),
    client: agenda.client ? freeze(agenda.client) : null,
  }
}

/** Pendentes de verdade (as concluídas durante a reunião ficam riscadas, mas não contam). */
export function openCount(tasks: Pick<Task, "status">[]): number {
  return tasks.filter((task) => task.status !== "done").length
}
