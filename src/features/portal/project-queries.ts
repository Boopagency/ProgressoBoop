import "server-only"

import { cache } from "react"

import type { Deliverable } from "@/features/deliverables/logic"
import { toPortalMessage, type PortalMessage } from "@/features/portal/content-queries"
import type { PortalProject, PortalStep, PortalStepApproval } from "@/features/portal/project-logic"
import { requirePortalUser } from "@/features/portal/session"
import { withAudio } from "@/features/voice/queries"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/*
 * Leitura dos projetos no portal, só pelas funções `portal_*` com a sessão da
 * pessoa: o banco confere o cliente e devolve só os campos liberados. As
 * colunas que podem vir vazias voltam a aceitar null.
 */

/** Projetos do cliente (sem os cancelados). Cliente de outra conta volta vazio. */
export const getPortalProjects = cache(async (clientId: string): Promise<PortalProject[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_projects", { target_client: clientId })
  if (error) throw loadError(error, "os projetos")
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    template: row.template ?? null,
    status: row.status,
    starts_on: row.starts_on,
    due_on: row.due_on ?? null,
    completed_at: row.completed_at ?? null,
    tasks_total: row.tasks_total ?? 0,
    tasks_done: row.tasks_done ?? 0,
  }))
})

/** Etapas do projeto que a equipe marcou como "o cliente vê", em ordem de prazo. */
export const getPortalProjectSteps = cache(async (projectId: string): Promise<PortalStep[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_project_steps", { target_project: projectId })
  if (error) throw loadError(error, "as etapas")
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    due_date: row.due_date ?? null,
    completed_at: row.completed_at ?? null,
  }))
})

export const getPortalProjectMessages = cache(async (projectId: string): Promise<PortalMessage[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_project_messages", { target_project: projectId })
  if (error) throw loadError(error, "as mensagens")
  return withAudio(supabase, (data ?? []).map(toPortalMessage))
})

/**
 * Etapas que pedem a aprovação do cliente, em todos os projetos dele: as que
 * esperam a resposta vêm primeiro. Cliente de outra conta volta vazio.
 */
export const getPortalStepApprovals = cache(async (clientId: string): Promise<PortalStepApproval[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_step_approvals", { target_client: clientId })
  if (error) throw loadError(error, "as etapas para aprovar")
  return (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name,
    title: row.title,
    status: row.status,
    due_date: row.due_date ?? null,
    completed_at: row.completed_at ?? null,
    awaiting: row.awaiting ?? false,
    approval: row.approval ?? null,
    note: row.note ?? null,
    decided_by_name: row.decided_by_name ?? null,
    decided_at: row.decided_at ?? null,
  }))
})

/** Entregas (links e arquivos) das etapas que o cliente vê no projeto, por etapa. */
export const getPortalStepDeliverables = cache(async (projectId: string): Promise<Map<string, Deliverable[]>> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_step_deliverables", { target_project: projectId })
  const byStep = new Map<string, Deliverable[]>()
  // Sem as entregas, a etapa continua aparecendo (e a aprovação funcionando).
  if (error) {
    console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    return byStep
  }
  for (const row of data ?? []) {
    const item: Deliverable = {
      id: row.id,
      task_id: row.task_id,
      kind: row.kind === "file" ? "file" : "link",
      title: row.title,
      url: row.url ?? null,
      file_path: row.file_path ?? null,
      mime_type: row.mime_type ?? null,
      created_at: row.created_at,
    }
    byStep.set(item.task_id, [...(byStep.get(item.task_id) ?? []), item])
  }
  return byStep
})
