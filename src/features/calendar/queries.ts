import "server-only"

import { requireUser } from "@/features/auth/session"
import { WEEKLY } from "@/features/calendar/recurrence"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { CalendarEvent } from "@/lib/types"

/** Todos os eventos; os recorrentes são expandidos no cliente para o período visível. */
export async function getEvents(): Promise<CalendarEvent[]> {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, event_type, start_at, end_at, all_day, recurrence_rule, client_id, created_by, created_at"
    )
    .order("start_at")
  if (error) throw loadError(error, "o calendário")

  return data.map((event) => ({
    ...event,
    // O banco só aceita FREQ=WEEKLY; qualquer outro valor é tratado como evento único.
    recurrence_rule: event.recurrence_rule === WEEKLY ? WEEKLY : null,
  }))
}
