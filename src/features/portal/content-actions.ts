"use server"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

import { MESSAGE_MAX } from "@/features/portal/content-logic"
import { toPortalMessage, type PortalMessage } from "@/features/portal/content-queries"
import { getPortalUser } from "@/features/portal/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * O que o cliente faz no portal: aprovar ou pedir ajuste num post "com o
 * cliente" e conversar no chat do post. Tudo pelas funções `portal_*`, que
 * conferem no banco o cliente, a etapa e o texto; aqui só a primeira
 * conferência e as mensagens em português.
 */

const POST_GONE = "Este post não está mais disponível."
const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const INVALID_BODY = "Escreva uma mensagem de até 5.000 caracteres."
const NOTE_REQUIRED = "Conte o que precisa mudar."
const INVALID_DECISION = "Escolha aprovar ou pedir ajuste."

/** Erros das funções do portal (a mensagem do banco é o código). */
const PORTAL_ERRORS: Partial<Record<string, string>> = {
  post_not_found: POST_GONE,
  channel_not_found: "A conversa deste cliente ainda não foi criada. Avise a equipe.",
  invalid_body: INVALID_BODY,
  note_required: NOTE_REQUIRED,
  not_in_client_review: "Este post já foi respondido. Atualize a página.",
  invalid_decision: INVALID_DECISION,
}

function failure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  const known = PORTAL_ERRORS[error.message]
  return known ? { ok: false, error: known } : dbFailure(error, fallback)
}

function refresh(postId: string) {
  revalidatePath("/portal", "layout")
  revalidatePath(`/portal/posts/${postId}`)
}

export async function reviewPortalPost(
  postId: string,
  input: { decision: "approve" | "changes"; note?: string }
): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(postId)) return { ok: false, error: POST_GONE }
  const decision = input.decision === "approve" || input.decision === "changes" ? input.decision : null
  if (!decision) return { ok: false, error: INVALID_DECISION }
  const note = String(input.note ?? "").trim()
  if (decision === "changes" && !note) return { ok: false, error: NOTE_REQUIRED }
  if (note.length > MESSAGE_MAX) return { ok: false, error: INVALID_BODY }

  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_review_post", {
    target_post: postId,
    decision,
    ...(note ? { note } : {}),
  })
  if (error) return failure(error, "Não foi possível enviar sua resposta.")
  refresh(postId)
  return { ok: true, data: null }
}

export async function sendPortalMessage(postId: string, body: string): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(postId)) return { ok: false, error: POST_GONE }
  const text = String(body ?? "").trim()
  if (!text || text.length > MESSAGE_MAX) return { ok: false, error: INVALID_BODY }

  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_send_message", { target_post: postId, message_body: text })
  if (error) return failure(error, "Não foi possível enviar a mensagem.")
  refresh(postId)
  return { ok: true, data: null }
}

/** Mensagens do post de novo (o chat atualiza sozinho enquanto está aberto). */
export async function loadPortalMessages(postId: string): Promise<ActionResult<PortalMessage[]>> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(postId)) return { ok: false, error: POST_GONE }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_post_messages", { target_post: postId })
  if (error) return failure(error, "Não foi possível carregar as mensagens.")
  return { ok: true, data: (data ?? []).map(toPortalMessage) }
}
