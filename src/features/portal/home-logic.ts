import { comparePosts } from "@/features/content/logic"
import type { PortalPost } from "@/features/portal/content-logic"
import type { PortalProject, PortalStepApproval } from "@/features/portal/project-logic"
import { addDaysToKey, toDateKey, toTimeLabel } from "@/lib/dates"
import type { DateKey, Timestamp } from "@/lib/types"

/*
 * Regras do painel (Início) do portal: funções puras, sem React. O painel é
 * leve: o que espera o cliente, os projetos com o andamento, as últimas
 * mensagens e os próximos posts. Nada interno da equipe.
 */

/** Quantos itens cada quadro do painel mostra (o resto fica na tela da seção). */
export const HOME_PROJECTS = 4
export const HOME_MESSAGES = 5
export const HOME_UPCOMING = 5

/** O que espera a resposta do cliente: um post para aprovar ou uma etapa de projeto. */
export type PendingApproval =
  | { kind: "post"; id: string; post: PortalPost }
  | { kind: "step"; id: string; step: PortalStepApproval }

/**
 * Posts em "Para aprovar" (pela data de publicação) e depois as etapas que
 * esperam a aprovação (a concluída há mais tempo primeiro).
 */
export function pendingApprovals(
  posts: readonly PortalPost[],
  steps: readonly PortalStepApproval[]
): PendingApproval[] {
  const reviewPosts = posts.filter((post) => post.stage === "client_review").sort(comparePosts)
  const awaitingSteps = steps
    .filter((step) => step.awaiting)
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))
  return [
    ...reviewPosts.map((post) => ({ kind: "post" as const, id: post.id, post })),
    ...awaitingSteps.map((step) => ({ kind: "step" as const, id: step.id, step })),
  ]
}

/** Projetos do painel: os em aberto (o banco já manda os concluídos por último). */
export function homeProjects(projects: readonly PortalProject[]): PortalProject[] {
  const open = projects.filter((project) => project.status !== "done")
  return (open.length > 0 ? open : projects).slice(0, HOME_PROJECTS)
}

/** Trecho de uma mensagem numa linha só, cortado no limite. */
export function messageExcerpt(body: string, max = 140): string {
  const text = body.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Quando a mensagem chegou: "14:32" hoje, "ontem" e, antes, "12/10". */
export function messageWhen(instant: Timestamp, today: DateKey): string {
  const day = toDateKey(instant)
  if (day === today) return toTimeLabel(instant)
  if (day === addDaysToKey(today, -1)) return "ontem"
  const [year, month, date] = day.split("-")
  return year === today.slice(0, 4) ? `${date}/${month}` : `${date}/${month}/${year}`
}
