import {
  addDaysToKey,
  isWithin,
  toDateKey,
  weekRangeOf,
  type DateRange,
} from "@/lib/dates"
import type { DateKey, Profile, Task, TaskArea, TaskStatus } from "@/lib/types"

/**
 * Regras de negócio das tarefas: funções puras, sem React,
 * usadas por todas as telas (Hoje, Tarefas, Calendário, Segunda).
 */

export interface DayContext {
  today: DateKey
  week: DateRange
}

export function dayContext(today: DateKey): DayContext {
  return { today, week: weekRangeOf(today) }
}

export function isDone(task: Task): boolean {
  return task.status === "done"
}

export function isAssignedTo(task: Task, profileId: string): boolean {
  return task.assignee_ids.includes(profileId)
}

/* ------------------------------------------------------------------ */
/* Agrupamento por prazo                                               */
/* ------------------------------------------------------------------ */

export type DueBucket = "overdue" | "today" | "week" | "later" | "undated"
export type TaskGroupKey = DueBucket | "done"

export const TASK_GROUP_LABEL: Record<TaskGroupKey, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  week: "Esta semana",
  later: "Depois",
  undated: "Sem prazo",
  done: "Concluídas",
}

export const TASK_GROUP_ORDER: TaskGroupKey[] = [
  "overdue",
  "today",
  "week",
  "later",
  "undated",
  "done",
]

export function dueBucket(task: Task, ctx: DayContext): DueBucket {
  if (!task.due_date) return "undated"
  if (task.due_date < ctx.today) return "overdue"
  if (task.due_date === ctx.today) return "today"
  if (task.due_date <= ctx.week.end) return "week"
  return "later"
}

const PRIORITY_WEIGHT = { high: 0, normal: 1, low: 2 } as const

/** Prazo mais próximo primeiro (sem prazo por último), depois prioridade. */
export function compareTasks(a: Task, b: Task): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  const byPriority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
  if (byPriority !== 0) return byPriority
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

/** Concluídas mais recentes primeiro. */
export function compareCompleted(a: Task, b: Task): number {
  return (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
}

/**
 * Agrupa tarefas por prazo. Tarefas concluídas vão para "done", exceto as que
 * o usuário acabou de concluir nesta tela (`keepInPlace`): elas continuam no
 * grupo original, riscadas, para a lista não "pular".
 */
export function groupTasks(
  tasks: Task[],
  ctx: DayContext,
  keepInPlace: ReadonlySet<string> = new Set()
): Record<TaskGroupKey, Task[]> {
  const groups: Record<TaskGroupKey, Task[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    undated: [],
    done: [],
  }
  for (const task of tasks) {
    const key: TaskGroupKey =
      isDone(task) && !keepInPlace.has(task.id) ? "done" : dueBucket(task, ctx)
    groups[key].push(task)
  }
  for (const key of TASK_GROUP_ORDER) {
    groups[key].sort(key === "done" ? compareCompleted : compareTasks)
  }
  return groups
}

/* ------------------------------------------------------------------ */
/* Progresso e resumo                                                  */
/* ------------------------------------------------------------------ */

export interface Progress {
  done: number
  total: number
  percent: number
}

export function progressOf(tasks: Task[]): Progress {
  const total = tasks.length
  const done = tasks.filter(isDone).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Tarefas com prazo dentro do período. */
export function dueWithin(tasks: Task[], range: DateRange): Task[] {
  return tasks.filter((task) => task.due_date !== null && isWithin(task.due_date, range))
}

/** Tarefas concluídas (por `completed_at`, no fuso de SP) dentro do período. */
export function completedWithin(tasks: Task[], range: DateRange): Task[] {
  return tasks.filter(
    (task) =>
      isDone(task) &&
      task.completed_at !== null &&
      isWithin(toDateKey(task.completed_at), range)
  )
}

export interface TodaySummary {
  overdue: number
  today: number
  week: number
  completedThisWeek: number
}

export function summarize(tasks: Task[], ctx: DayContext): TodaySummary {
  const open = tasks.filter((task) => !isDone(task))
  return {
    overdue: open.filter((task) => dueBucket(task, ctx) === "overdue").length,
    today: open.filter((task) => dueBucket(task, ctx) === "today").length,
    week: open.filter((task) => dueBucket(task, ctx) === "week").length,
    completedThisWeek: completedWithin(tasks, ctx.week).length,
  }
}

/* ------------------------------------------------------------------ */
/* Filtros da tela Tarefas                                             */
/* ------------------------------------------------------------------ */

/** "all", "mine" ou o id de uma pessoa. */
export type PersonFilter = string
export type StatusFilter = "open" | TaskStatus | "all"
export type DueFilter = "any" | DueBucket

/** "all", "none" (sem projeto) ou o id de um projeto. */
export type ProjectFilter = string

export interface TaskFilters {
  person: PersonFilter
  status: StatusFilter
  area: TaskArea | "all"
  client: string | "all"
  project: ProjectFilter
  due: DueFilter
}

export const DEFAULT_FILTERS: TaskFilters = {
  person: "all",
  status: "open",
  area: "all",
  client: "all",
  project: "all",
  due: "any",
}

/** Lista (por prazo), Tabela ou Quadro (por status). */
export type TaskViewMode = "list" | "table" | "board"

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.status !== DEFAULT_FILTERS.status ||
    filters.area !== DEFAULT_FILTERS.area ||
    filters.client !== DEFAULT_FILTERS.client ||
    filters.project !== DEFAULT_FILTERS.project ||
    filters.due !== DEFAULT_FILTERS.due
  )
}

function matchesStatus(task: Task, status: StatusFilter): boolean {
  if (status === "all") return true
  if (status === "open") return !isDone(task)
  return task.status === status
}

export function filterTasks(
  tasks: Task[],
  filters: TaskFilters,
  ctx: DayContext,
  currentUserId: string,
  keepInPlace: ReadonlySet<string> = new Set(),
  { ignoreStatus = false }: { ignoreStatus?: boolean } = {}
): Task[] {
  const personId = filters.person === "mine" ? currentUserId : filters.person
  return tasks.filter((task) => {
    if (personId !== "all" && !isAssignedTo(task, personId)) return false
    if (!ignoreStatus && !keepInPlace.has(task.id) && !matchesStatus(task, filters.status)) return false
    if (filters.area !== "all" && task.area !== filters.area) return false
    if (filters.client !== "all" && task.client_id !== filters.client) return false
    if (filters.project === "none" ? task.project_id !== null : filters.project !== "all" && task.project_id !== filters.project) {
      return false
    }
    if (filters.due !== "any" && dueBucket(task, ctx) !== filters.due) return false
    return true
  })
}

/* ------------------------------------------------------------------ */
/* Quadro e tabela                                                     */
/* ------------------------------------------------------------------ */

/** Concluídas que aparecem no quadro: as dos últimos 14 dias. */
export const BOARD_DONE_DAYS = 14

/** Colunas do quadro: A fazer, Fazendo e Feito (só as concluídas recentes). */
export function boardColumns(
  tasks: Task[],
  today: DateKey,
  keepInPlace: ReadonlySet<string> = new Set()
): Record<TaskStatus, Task[]> {
  const since = addDaysToKey(today, -BOARD_DONE_DAYS)
  const columns: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
  for (const task of tasks) {
    if (task.status === "done") {
      const day = task.completed_at ? toDateKey(task.completed_at) : null
      if (!keepInPlace.has(task.id) && (day === null || day < since)) continue
    }
    columns[task.status].push(task)
  }
  columns.todo.sort(compareTasks)
  columns.doing.sort(compareTasks)
  columns.done.sort(compareCompleted)
  return columns
}

export type TaskSortKey = "title" | "status" | "due" | "priority" | "project" | "client" | "area"

const STATUS_WEIGHT: Record<TaskStatus, number> = { doing: 0, todo: 1, done: 2 }

/** Ordenação da tabela. Empates caem na ordem padrão (prazo, prioridade). */
export function sortTasks(
  tasks: Task[],
  key: TaskSortKey,
  direction: "asc" | "desc",
  names: { project: (id: string | null) => string; client: (id: string | null) => string; area: (area: TaskArea | null) => string }
): Task[] {
  const factor = direction === "asc" ? 1 : -1
  const text = (a: string, b: string) => {
    if (!a && b) return 1
    if (a && !b) return -1
    return a.localeCompare(b, "pt-BR")
  }
  return [...tasks].sort((a, b) => {
    let result = 0
    switch (key) {
      case "title":
        result = factor * a.title.localeCompare(b.title, "pt-BR")
        break
      case "status":
        result = factor * (STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status])
        break
      case "priority":
        result = factor * (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
        break
      case "due":
        if (a.due_date !== b.due_date) {
          // Sem prazo fica sempre no fim.
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          result = factor * (a.due_date < b.due_date ? -1 : 1)
        }
        break
      case "project":
        result = text(names.project(a.project_id), names.project(b.project_id)) * (names.project(a.project_id) && names.project(b.project_id) ? factor : 1)
        break
      case "client":
        result = text(names.client(a.client_id), names.client(b.client_id)) * (names.client(a.client_id) && names.client(b.client_id) ? factor : 1)
        break
      case "area":
        result = text(names.area(a.area), names.area(b.area)) * (names.area(a.area) && names.area(b.area) ? factor : 1)
        break
    }
    return result !== 0 ? result : compareTasks(a, b)
  })
}

/* ------------------------------------------------------------------ */
/* Pessoas                                                             */
/* ------------------------------------------------------------------ */

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

/** "Jabez", "Jabez e Renatha", "Todos". */
export function assigneesLabel(assigneeIds: string[], profiles: Profile[]): string {
  if (assigneeIds.length === 0) return "Sem responsável"
  if (profiles.length > 1 && profiles.every((profile) => assigneeIds.includes(profile.id))) {
    return "Todos"
  }
  const names = profiles
    .filter((profile) => assigneeIds.includes(profile.id))
    .map((profile) => firstName(profile.full_name))
  if (names.length <= 1) return names[0] ?? "Sem responsável"
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`
}
