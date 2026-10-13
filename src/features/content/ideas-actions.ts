"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { ideaToPost, insertIdea, NOT_FOUND, patchIdea } from "@/features/content/ideas-mutations"
import type { IdeaInput, IdeaPatch } from "@/features/content/ideas-validation"
import type { PostSummary } from "@/features/content/logic"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, ContentFormat, ContentIdea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions do banco de ideias. O banco cuida da autoria, do
 * updated_at e do RLS; excluir o post de uma ideia a devolve para as ideias
 * livres (post_id volta a null). A regra fica em ideas-mutations.ts.
 */

function refreshApp() {
  revalidatePath("/", "layout")
}

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) refreshApp()
  return result
}

export async function createIdea(input: IdeaInput): Promise<ActionResult<ContentIdea>> {
  await requireUser()
  return refreshed(await insertIdea(await createClient(), input))
}

/** Edita a ideia (só os campos enviados). O vínculo com o post só muda por "Virar post". */
export async function updateIdea(id: string, patch: IdeaPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchIdea(await createClient(), id, patch))
}

/** Exclui a ideia. O post que nasceu dela (se houver) continua. */
export async function deleteIdea(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_ideas").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir a ideia.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** "Virar post": cria o post a partir da ideia e liga os dois (regra em ideas-mutations.ts). */
export async function convertIdeaToPost(id: string, format?: ContentFormat | null): Promise<ActionResult<PostSummary>> {
  const user = await requireUser()
  return refreshed(await ideaToPost(await createClient(), user.id, id, format))
}
