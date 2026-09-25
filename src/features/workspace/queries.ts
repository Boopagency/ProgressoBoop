import "server-only"

import { requireUser } from "@/features/auth/session"
import type { Client, Plan, Profile } from "@/lib/types"
import { mockDb, snapshot } from "@/server/mock/db"

/** Dados de referência usados em quase todas as telas. */
export interface Workspace {
  profiles: Profile[]
  clients: Client[]
  plans: Plan[]
}

export async function getWorkspace(): Promise<Workspace> {
  await requireUser()
  const db = mockDb()
  return snapshot({
    profiles: db.profiles,
    clients: [...db.clients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    plans: db.plans,
  })
}
