import "server-only"

import { ACTIVITY_COLUMNS, asActivity } from "@/features/activity/queries"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, ActivityEntry } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Comentários no histórico de um item (Server Actions e conector do Claude).
 * O banco completa título, projeto e cliente do comentário e só deixa cada
 * pessoa editar e apagar os próprios (RLS).
 */

const BODY_MAX = 5000
export const COMMENTABLE = ["task", "project", "decision", "deal", "content_post"] as const
export type Commentable = (typeof COMMENTABLE)[number]

export function isCommentable(value: unknown): value is Commentable {
  return COMMENTABLE.includes(value as Commentable)
}

export function cleanBody(raw: unknown): string | null {
  const body = typeof raw === "string" ? raw.trim() : ""
  return body && body.length <= BODY_MAX ? body : null
}

export async function insertComment(
  supabase: SupabaseServerClient,
  type: unknown,
  id: unknown,
  body: unknown
): Promise<ActionResult<ActivityEntry>> {
  if (!isCommentable(type) || !isUuid(id)) return { ok: false, error: "Item inválido." }
  const text = cleanBody(body)
  if (!text) return { ok: false, error: "Escreva o comentário (até 5.000 letras)." }

  const { data, error } = await supabase
    .from("activity")
    .insert({ entity_type: type, entity_id: id, action: "comment", body: text })
    .select(ACTIVITY_COLUMNS)
    .single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse item não existe mais." }
    return dbFailure(error, "Não foi possível comentar.")
  }
  return { ok: true, data: asActivity(data) }
}
