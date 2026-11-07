import "server-only"

import { requireUser } from "@/features/auth/session"
import { parseIdentification, type ClientBriefingSummary } from "@/features/briefing/logic"
import { isMissingRelation } from "@/features/client-files/queries"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/** O que a ficha do cliente mostra do briefing. `available: false` antes da migration entrar no banco. */
export type ClientBriefingState = { available: false } | { available: true; briefing: ClientBriefingSummary | null }

/** Briefing do cliente (visão da equipe), com quantas perguntas ativas já têm resposta. */
export async function getClientBriefing(clientId: string): Promise<ClientBriefingState> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_briefings")
    .select("id, template_id, status, due_on, identification, released_at, started_at, submitted_at, last_seen_at")
    .eq("client_id", clientId)
    .maybeSingle()
  if (error) {
    // Antes da migration do briefing, a página do cliente abre sem o cartão.
    if (isMissingRelation(error)) return { available: false }
    throw loadError(error, "o briefing do cliente")
  }
  if (!data) return { available: true, briefing: null }

  const [questions, answers] = await Promise.all([
    supabase
      .from("briefing_questions")
      .select("id, briefing_blocks!inner(template_id, active)")
      .eq("active", true)
      .eq("briefing_blocks.template_id", data.template_id)
      .eq("briefing_blocks.active", true),
    supabase.from("briefing_answers").select("question_id").eq("briefing_id", data.id).eq("skipped", false),
  ])
  if (questions.error) throw loadError(questions.error, "o briefing do cliente")
  if (answers.error) throw loadError(answers.error, "o briefing do cliente")
  const active = new Set(questions.data.map((row) => row.id))

  return {
    available: true,
    briefing: {
      id: data.id,
      status: data.status,
      due_on: data.due_on,
      identification: parseIdentification(data.identification),
      released_at: data.released_at,
      started_at: data.started_at,
      submitted_at: data.submitted_at,
      last_seen_at: data.last_seen_at,
      answered: answers.data.filter((row) => active.has(row.question_id)).length,
      total: active.size,
    },
  }
}
