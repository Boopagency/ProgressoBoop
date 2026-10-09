import { PROJECT_TEMPLATES } from "@/features/projects/templates"
import type { DateKey, ProjectStatus, TaskStatus, Timestamp } from "@/lib/types"

/*
 * Projetos no portal: o que o cliente vê de cada projeto (sem descrição,
 * responsável nem tarefas internas) e as etapas marcadas como "o cliente vê".
 */

export interface PortalProject {
  id: string
  name: string
  template: string | null
  status: ProjectStatus
  starts_on: DateKey
  due_on: DateKey | null
  completed_at: Timestamp | null
  /** Todas as tarefas do projeto, como no admin; o cliente vê só os números. */
  tasks_total: number
  tasks_done: number
}

export interface PortalStep {
  id: string
  title: string
  status: TaskStatus
  due_date: DateKey | null
  completed_at: Timestamp | null
}

/** Quanto do projeto já foi feito (0 a 100). */
export function projectPercent(project: Pick<PortalProject, "tasks_total" | "tasks_done" | "status">): number {
  if (project.status === "done") return 100
  if (project.tasks_total === 0) return 0
  return Math.round((project.tasks_done / project.tasks_total) * 100)
}

/** Nome do modelo do projeto (ex.: "Site institucional"), quando veio de um. */
export function templateName(key: string | null): string | null {
  return PROJECT_TEMPLATES.find((template) => template.key === key)?.name ?? null
}

/** Próxima etapa ainda aberta (a primeira da lista, que vem em ordem de prazo). */
export function nextStep(steps: PortalStep[]): PortalStep | null {
  return steps.find((step) => step.status !== "done") ?? null
}
