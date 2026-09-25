import "server-only"

import { requireUser } from "@/features/auth/session"
import type { Task } from "@/lib/types"
import { mockDb, snapshot } from "@/server/mock/db"

/**
 * Todas as tarefas da equipe (o volume é pequeno; os filtros rodam no
 * cliente). Etapa 2:
 * `supabase.from("tasks").select("*, task_assignees(profile_id)")`.
 */
export async function getTasks(): Promise<Task[]> {
  await requireUser()
  return snapshot(mockDb().tasks)
}
