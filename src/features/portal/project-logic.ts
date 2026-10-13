import { PROJECT_TEMPLATES } from "@/features/projects/templates"
import { formatShortDate, toDateKey } from "@/lib/dates"
import type { ClientApprovalResult, DateKey, ProjectStatus, TaskStatus, Timestamp } from "@/lib/types"

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

/**
 * Etapa que pede a aprovação do cliente (`portal_step_approvals`): se espera a
 * resposta dele agora e a última resposta (aprovado ou pediu ajustes, nota,
 * quem e quando). Concluir de novo limpa a resposta e volta a esperar.
 */
export interface PortalStepApproval {
  id: string
  project_id: string
  project_name: string
  title: string
  status: TaskStatus
  due_date: DateKey | null
  completed_at: Timestamp | null
  awaiting: boolean
  approval: ClientApprovalResult | null
  note: string | null
  decided_by_name: string | null
  decided_at: Timestamp | null
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

/** Situação da aprovação de uma etapa, para a linha dela no projeto. */
export type StepApprovalState =
  | { kind: "awaiting" }
  | { kind: "approved"; text: string; note: string | null }
  | { kind: "changes"; text: string; note: string | null }
  | { kind: "pending" }

/**
 * Esperando a resposta, aprovada ("Aprovada por Bárbara em 12/10"), com
 * ajustes pedidos ou, antes de a equipe concluir, só "pede sua aprovação".
 */
export function stepApprovalState(approval: PortalStepApproval, today: DateKey): StepApprovalState {
  if (approval.awaiting) return { kind: "awaiting" }
  const who = approval.decided_by_name ?? "você"
  const when = approval.decided_at ? ` em ${formatShortDate(toDateKey(approval.decided_at), today)}` : ""
  if (approval.approval === "approved") return { kind: "approved", text: `Aprovada por ${who}${when}`, note: approval.note }
  if (approval.approval === "changes") return { kind: "changes", text: `Ajustes pedidos por ${who}${when}`, note: approval.note }
  return { kind: "pending" }
}
