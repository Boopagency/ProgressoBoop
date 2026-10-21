import "server-only"

import { avatarPublicUrl } from "@/features/account/logic"
import { requireUser } from "@/features/auth/session"
import { PROJECT_COLUMNS } from "@/features/projects/columns"
import { supabaseEnv } from "@/lib/supabase/env"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { Client, Profile, Project, SavedView } from "@/lib/types"

/** Quem acessa o portal por um cliente, para as conversas mostrarem o nome e a foto. */
export interface ClientPerson {
  id: string
  full_name: string
  avatar_url: string | null
}

/** Dados de referência usados em quase todas as telas. */
export interface Workspace {
  profiles: Profile[]
  clients: Client[]
  /** Todos os projetos (o volume é pequeno). */
  projects: Project[]
  /** Visões salvas da tela Tarefas (também no menu lateral e na busca). */
  savedViews: SavedView[]
  /** Contas de cliente (portal), uma por pessoa. */
  clientPeople: ClientPerson[]
}

export async function getWorkspace(): Promise<Workspace> {
  await requireUser()
  return fetchWorkspace(await createClient())
}

export async function fetchWorkspace(supabase: SupabaseServerClient): Promise<Workspace> {
  const [profiles, clients, projects, savedViews, members] = await Promise.all([
    // A ordem de criação dos perfis é a ordem da equipe (Jabez, Renatha, Léo).
    supabase.from("profiles").select("id, full_name, avatar_url, role").order("created_at"),
    supabase.from("clients").select("id, name, active, avatar_path, instagram_handle, instagram_bio"),
    supabase.from("projects").select(PROJECT_COLUMNS).order("starts_on"),
    supabase.from("saved_views").select("id, name, query, created_by, created_at").order("created_at"),
    supabase.from("client_members").select("user_id, full_name, avatar_path").order("created_at"),
  ])
  if (profiles.error) throw loadError(profiles.error, "a equipe")
  if (clients.error) throw loadError(clients.error, "os clientes")
  if (projects.error) throw loadError(projects.error, "os projetos")
  if (savedViews.error) throw loadError(savedViews.error, "as visões salvas")
  if (members.error) throw loadError(members.error, "os acessos dos clientes")

  // A mesma pessoa pode acompanhar mais de um cliente; o nome e a foto são os mesmos.
  const { url } = supabaseEnv()
  const clientPeople = new Map<string, ClientPerson>()
  for (const member of members.data) {
    if (clientPeople.has(member.user_id)) continue
    clientPeople.set(member.user_id, {
      id: member.user_id,
      full_name: member.full_name,
      avatar_url: member.avatar_path ? avatarPublicUrl(url, member.avatar_path) : null,
    })
  }

  return {
    profiles: profiles.data,
    clients: clients.data.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    projects: projects.data,
    savedViews: savedViews.data,
    clientPeople: [...clientPeople.values()],
  }
}
