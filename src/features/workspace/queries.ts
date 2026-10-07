import "server-only"

import { requireUser } from "@/features/auth/session"
import { PROJECT_COLUMNS } from "@/features/projects/columns"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Client, Profile, Project, SavedView } from "@/lib/types"

/** Dados de referência usados em quase todas as telas. */
export interface Workspace {
  profiles: Profile[]
  clients: Client[]
  /** Todos os projetos (o volume é pequeno). */
  projects: Project[]
  /** Visões salvas da tela Tarefas (também no menu lateral e na busca). */
  savedViews: SavedView[]
}

export async function getWorkspace(): Promise<Workspace> {
  await requireUser()
  const supabase = await createClient()

  const [profiles, clients, projects, savedViews] = await Promise.all([
    // A ordem de criação dos perfis é a ordem da equipe (Jabez, Renatha, Léo).
    supabase.from("profiles").select("id, full_name, avatar_url, role").order("created_at"),
    supabase.from("clients").select("id, name, active"),
    supabase.from("projects").select(PROJECT_COLUMNS).order("starts_on"),
    supabase.from("saved_views").select("id, name, query, created_by, created_at").order("created_at"),
  ])
  if (profiles.error) throw loadError(profiles.error, "a equipe")
  if (clients.error) throw loadError(clients.error, "os clientes")
  if (projects.error) throw loadError(projects.error, "os projetos")
  if (savedViews.error) throw loadError(savedViews.error, "as visões salvas")

  return {
    profiles: profiles.data,
    clients: clients.data.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    projects: projects.data,
    savedViews: savedViews.data,
  }
}
