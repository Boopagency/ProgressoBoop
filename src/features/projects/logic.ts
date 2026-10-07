import type { ProjectTemplate } from "@/features/projects/templates"
import { isDone, type Progress } from "@/features/tasks/logic"
import { addDaysToKey, daysBetween, formatShortDate, toDateKey } from "@/lib/dates"
import type { DateKey, Project, ProjectStatus, Task, TaskArea } from "@/lib/types"

/*
 * Regras dos projetos: funções puras, usadas na lista, na página do projeto,
 * na tela Hoje, na pauta da weekly e na página do cliente.
 */

export const OPEN_PROJECT_STATUSES: ProjectStatus[] = ["planned", "active", "paused"]

/** Planejado, em andamento ou pausado (concluídos e cancelados ficam no histórico). */
export function isOpenProject(project: Pick<Project, "status">): boolean {
  return OPEN_PROJECT_STATUSES.includes(project.status)
}

export interface ProjectStats extends Progress {
  open: number
  overdue: number
  /** Próximo prazo (de hoje em diante) entre as tarefas abertas; os vencidos contam em `overdue`. */
  nextDue: DateKey | null
}

/** Progresso do projeto a partir das tarefas dele. */
export function projectStats(projectId: string, tasks: Task[], today: DateKey): ProjectStats {
  const own = tasks.filter((task) => task.project_id === projectId)
  const done = own.filter(isDone).length
  const open = own.filter((task) => !isDone(task))
  const dues = open
    .map((task) => task.due_date)
    .filter((due): due is DateKey => due !== null && due >= today)
    .sort()
  return {
    total: own.length,
    done,
    percent: own.length === 0 ? 0 : Math.round((done / own.length) * 100),
    open: open.length,
    overdue: open.filter((task) => task.due_date !== null && task.due_date < today).length,
    nextDue: dues[0] ?? null,
  }
}

export type TimingTone = "late" | "soon" | "normal" | "muted"

/** "Faltam 12 dias", "Termina hoje", "Prazo passou há 3 dias", "Concluído em 10/10". */
export function projectTiming(
  project: Pick<Project, "status" | "due_on" | "completed_at">,
  today: DateKey
): { label: string; tone: TimingTone } {
  if (project.status === "done") {
    return {
      label: project.completed_at ? `Concluído em ${formatShortDate(toDateKey(project.completed_at), today)}` : "Concluído",
      tone: "muted",
    }
  }
  if (project.status === "canceled") return { label: "Cancelado", tone: "muted" }
  if (!project.due_on) return { label: "Sem prazo", tone: "muted" }
  const days = daysBetween(today, project.due_on)
  if (days < 0) {
    return { label: days === -1 ? "Prazo passou ontem" : `Prazo passou há ${-days} dias`, tone: "late" }
  }
  if (days === 0) return { label: "Termina hoje", tone: "soon" }
  if (days === 1) return { label: "Falta 1 dia", tone: "soon" }
  return { label: `Faltam ${days} dias`, tone: days <= 7 ? "soon" : "normal" }
}

const STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  planned: 1,
  paused: 2,
  done: 3,
  canceled: 4,
}

/** Em andamento primeiro; dentro do status, o prazo mais próximo (sem prazo por último). */
export function compareProjects(a: Project, b: Project): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (byStatus !== 0) return byStatus
  if (a.status === "done" || a.status === "canceled") {
    return (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)
  }
  if (a.due_on !== b.due_on) {
    if (!a.due_on) return 1
    if (!b.due_on) return -1
    return a.due_on < b.due_on ? -1 : 1
  }
  return a.name.localeCompare(b.name, "pt-BR")
}

/** Projetos em foco (tela Hoje e weekly): fixados e ainda abertos. */
export function focusProjects(projects: Project[]): Project[] {
  return projects.filter((project) => project.pinned && isOpenProject(project)).sort(compareProjects)
}

/* ------------------------------------------------------------------ */
/* Tarefas iniciais                                                    */
/* ------------------------------------------------------------------ */

export interface SeedTask {
  title: string
  due_date: DateKey | null
  area: TaskArea | null
  priority?: Task["priority"]
}

/** Tarefas de um modelo, com prazos a partir do começo do projeto. */
export function templateTasks(template: ProjectTemplate, startsOn: DateKey): SeedTask[] {
  return template.tasks.map((task) => ({
    title: task.title,
    due_date: addDaysToKey(startsOn, task.offset),
    area: task.area ?? template.area,
  }))
}

/**
 * Tarefas copiadas de outro projeto: mesmo título, área e prioridade, com o
 * prazo na mesma distância do começo (o projeto novo "repete" o anterior).
 */
export function copiedTasks(
  source: Pick<Project, "starts_on">,
  sourceTasks: Pick<Task, "title" | "due_date" | "area" | "priority" | "created_at">[],
  startsOn: DateKey
): SeedTask[] {
  return [...sourceTasks]
    .sort((a, b) => {
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : 1
      }
      return a.created_at < b.created_at ? -1 : 1
    })
    .map((task) => ({
      title: task.title,
      due_date: task.due_date ? addDaysToKey(startsOn, Math.max(0, daysBetween(source.starts_on, task.due_date))) : null,
      area: task.area,
      priority: task.priority,
    }))
}
