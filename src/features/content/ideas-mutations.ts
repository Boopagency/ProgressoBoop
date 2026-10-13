import "server-only"

import { ideaBrief } from "@/features/content/ideas-logic"
import { IDEA_COLUMNS } from "@/features/content/ideas-queries"
import { parseIdeaInput, parseIdeaPatch } from "@/features/content/ideas-validation"
import type { PostSummary } from "@/features/content/logic"
import { POST_SUMMARY_COLUMNS } from "@/features/content/queries"
import { BRIEF_MAX, parsePostInput } from "@/features/content/validation"
import { isContentFormat } from "@/lib/labels"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, ContentIdea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações do banco de ideias (Server Actions e conector do Claude). O banco
 * cuida da autoria, do updated_at e do RLS.
 */

export const NOT_FOUND = { ok: false, error: "Essa ideia não existe mais." } as const
const ALREADY_POST = { ok: false, error: "Essa ideia já virou post." } as const

export async function insertIdea(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<ContentIdea>> {
  const parsed = parseIdeaInput(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("content_ideas").insert(parsed.value).select(IDEA_COLUMNS).single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse cliente não existe mais." }
    return dbFailure(error, "Não foi possível salvar a ideia.")
  }
  return { ok: true, data }
}

/** Edita a ideia (só os campos enviados). O vínculo com o post só muda por "Virar post". */
export async function patchIdea(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseIdeaPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }
  const { data, error } = await supabase.from("content_ideas").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Esse cliente não existe mais." }
    return dbFailure(error, "Não foi possível salvar a ideia.")
  }
  if (data.length === 0) return NOT_FOUND
  return { ok: true, data: null }
}

/**
 * "Virar post": cria o post do cliente com o título e o formato da ideia (ou
 * o formato escolhido, quando a ideia não tem) e as notas e o link de
 * referência no conteúdo/ideia, em produção, sem data e com quem converteu
 * como responsável. A ideia passa a apontar para o post ("no cronograma").
 * Devolve o post, para a tela abri-lo.
 */
export async function ideaToPost(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
  format?: unknown
): Promise<ActionResult<PostSummary>> {
  if (!isUuid(id)) return NOT_FOUND
  if (format != null && !isContentFormat(format)) return { ok: false, error: "Formato inválido." }

  const { data: idea, error: readError } = await supabase
    .from("content_ideas")
    .select("client_id, title, notes, format, reference_url, post_id")
    .eq("id", id)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível criar o post.")
  if (!idea) return NOT_FOUND
  if (idea.post_id) return ALREADY_POST
  const postFormat = format ?? idea.format
  if (!postFormat) return { ok: false, error: "Escolha o formato do post." }

  const parsed = parsePostInput({
    title: idea.title,
    client_id: idea.client_id,
    format: postFormat,
    brief: ideaBrief(idea, BRIEF_MAX),
    owner_id: userId,
  })
  if (!parsed.ok) return parsed
  const { data: post, error } = await supabase
    .from("content_posts")
    .insert({ ...parsed.value, slides: [] })
    .select(POST_SUMMARY_COLUMNS)
    .single()
  if (error) {
    if (error.code === "23503") return { ok: false, error: "O cliente desta ideia não existe mais." }
    return dbFailure(error, "Não foi possível criar o post.")
  }

  // Só liga se ninguém converteu a ideia nesse meio-tempo; senão, desfaz o post.
  const { data: linked, error: linkError } = await supabase
    .from("content_ideas")
    .update({ post_id: post.id })
    .eq("id", id)
    .is("post_id", null)
    .select("id")
  if (linkError || linked.length === 0) {
    await supabase.from("content_posts").delete().eq("id", post.id)
    return linkError ? dbFailure(linkError, "Não foi possível criar o post.") : ALREADY_POST
  }

  return { ok: true, data: post }
}
