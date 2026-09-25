import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Client, Plan, Profile } from "@/lib/types"

/** Dados de referência usados em quase todas as telas. */
export interface Workspace {
  profiles: Profile[]
  clients: Client[]
  plans: Plan[]
}

export async function getWorkspace(): Promise<Workspace> {
  await requireUser()
  const supabase = await createClient()

  const [profiles, clients, plans] = await Promise.all([
    // A ordem de criação dos perfis é a ordem da equipe (Jabez, Renatha, Léo).
    supabase.from("profiles").select("id, full_name, avatar_url, role").order("created_at"),
    supabase.from("clients").select("id, name, active"),
    supabase.from("plans").select("id, name, starts_on, ends_on").order("starts_on"),
  ])
  if (profiles.error) throw loadError(profiles.error, "a equipe")
  if (clients.error) throw loadError(clients.error, "os clientes")
  if (plans.error) throw loadError(plans.error, "os planos")

  return {
    profiles: profiles.data,
    clients: clients.data.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    plans: plans.data,
  }
}
