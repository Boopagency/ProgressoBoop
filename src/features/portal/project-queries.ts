import "server-only"

import { cache } from "react"

import { toPortalMessage, type PortalMessage } from "@/features/portal/content-queries"
import type { PortalProject, PortalStep } from "@/features/portal/project-logic"
import { requirePortalUser } from "@/features/portal/session"
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
  return (data ?? []).map(toPortalMessage)
})
