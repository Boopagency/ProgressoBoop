"use server"

import { revalidatePath } from "next/cache"

import { ACTIVITY_COLUMNS, asActivity } from "@/features/activity/queries"
import { requireUser } from "@/features/auth/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, ActivityEntry } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Comentários e leitura do histórico de um item (painel da tarefa). O banco
 * completa título, projeto e cliente do comentário e só deixa cada pessoa
 * editar e apagar os próprios (RLS).
 */

const BODY_MAX = 5000
const COMMENTABLE = ["task", "project", "decision", "deal", "content_post"] as const
type Commentable = (typeof COMMENTABLE)[number]

function isCommentable(value: unknown): value is Commentable {
  return COMMENTABLE.includes(value as Commentable)
}

function cleanBody(raw: unknown): string | null {
  const body = typeof raw === "string" ? raw.trim() : ""
  return body && body.length <= BODY_MAX ? body : null
}

/** Histórico e comentários de uma tarefa, projeto, decisão, negócio ou post (mais recente primeiro). */
export async function loadActivity(type: Commentable, id: string): Promise<ActionResult<ActivityEntry[]>> {
  await requireUser()
  if (!isCommentable(type) || !isUuid(id)) return { ok: false, error: "Item inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity")
    .select(ACTIVITY_COLUMNS)
    .eq("entity_type", type)
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return dbFailure(error, "Não foi possível carregar o histórico.")
  return { ok: true, data: data.map((row) => asActivity(row)) }
}

export async function addComment(type: Commentable, id: string, body: string): Promise<ActionResult<ActivityEntry>> {
  await requireUser()
  if (!isCommentable(type) || !isUuid(id)) return { ok: false, error: "Item inválido." }
  const text = cleanBody(body)
  if (!text) return { ok: false, error: "Escreva o comentário (até 5.000 letras)." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity")
    .insert({ entity_type: type, entity_id: id, action: "comment", body: text })
    .select(ACTIVITY_COLUMNS)
    .single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse item não existe mais." }
    return dbFailure(error, "Não foi possível comentar.")
  }
  revalidatePath("/", "layout")
  return { ok: true, data: asActivity(data) }
}

export async function editComment(commentId: string, body: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(commentId)) return { ok: false, error: "Comentário inválido." }
  const text = cleanBody(body)
  if (!text) return { ok: false, error: "Escreva o comentário (até 5.000 letras)." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity")
    .update({ body: text })
    .eq("id", commentId)
    .eq("action", "comment")
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o comentário.")
  if (data.length === 0) return { ok: false, error: "Só quem escreveu pode editar o comentário." }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(commentId)) return { ok: false, error: "Comentário inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity")
    .delete()
    .eq("id", commentId)
    .eq("action", "comment")
    .select("id")
  if (error) return dbFailure(error, "Não foi possível apagar o comentário.")
  if (data.length === 0) return { ok: false, error: "Só quem escreveu pode apagar o comentário." }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}
