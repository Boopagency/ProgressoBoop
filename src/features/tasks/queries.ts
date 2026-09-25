import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Task } from "@/lib/types"

/** Todas as tarefas da equipe (o volume é pequeno; os filtros rodam no cliente). */
export async function getTasks(): Promise<Task[]> {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, client_id, plan_id, area, status, priority, due_date, completed_at, created_by, created_at, updated_at, task_assignees(profile_id)"
    )
    .order("due_date", { nullsFirst: false })
    .order("created_at")
  if (error) throw loadError(error, "as tarefas")

  return data.map(({ task_assignees, ...task }) => ({
    ...task,
    assignee_ids: task_assignees.map((assignee) => assignee.profile_id),
  }))
}
