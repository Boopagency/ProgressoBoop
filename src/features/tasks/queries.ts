import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { Task } from "@/lib/types"

/** Todas as tarefas da equipe (o volume é pequeno; os filtros rodam no cliente). */
export async function getTasks(): Promise<Task[]> {
  await requireUser()
  return fetchTasks(await createClient())
}

/** O mesmo com o cliente de quem chama (a sessão do app ou o token do conector do Claude), sob o RLS. */
export async function fetchTasks(supabase: SupabaseServerClient): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, client_id, project_id, client_visible, client_approval_required, client_approval, client_approval_note, client_approval_by, client_approval_at, meeting_id, doc_id, client_review_id, communication_id, content_post_id, area, status, priority, due_date, completed_at, created_by, created_at, updated_at, task_assignees(profile_id)"
    )
    .order("due_date", { nullsFirst: false })
    .order("created_at")
  if (error) throw loadError(error, "as tarefas")

  return data.map(({ task_assignees, ...task }) => ({
    ...task,
    assignee_ids: task_assignees.map((assignee) => assignee.profile_id),
  }))
}
