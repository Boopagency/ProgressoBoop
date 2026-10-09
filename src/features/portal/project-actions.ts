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
 * Conversa do projeto no portal: o cliente escreve e lê pelas funções
 * `portal_*`, que conferem no banco o cliente e o texto. A mensagem cai no
 * canal "Alterações" do cliente, marcada com o projeto.
 */

const PROJECT_GONE = "Este projeto não está mais disponível."
const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const INVALID_BODY = "Escreva uma mensagem de até 5.000 caracteres."

/** Erros das funções do portal (a mensagem do banco é o código). */
const PORTAL_ERRORS: Partial<Record<string, string>> = {
  project_not_found: PROJECT_GONE,
  channel_not_found: "A conversa deste cliente ainda não foi criada. Avise a equipe.",
  invalid_body: INVALID_BODY,
}

function failure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  const known = PORTAL_ERRORS[error.message]
  return known ? { ok: false, error: known } : dbFailure(error, fallback)
}

export async function sendPortalProjectMessage(projectId: string, body: string): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(projectId)) return { ok: false, error: PROJECT_GONE }
  const text = String(body ?? "").trim()
  if (!text || text.length > MESSAGE_MAX) return { ok: false, error: INVALID_BODY }

  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_send_project_message", { target_project: projectId, message_body: text })
  if (error) return failure(error, "Não foi possível enviar a mensagem.")
  revalidatePath(`/portal/projetos/${projectId}`)
  return { ok: true, data: null }
}

/** Mensagens do projeto de novo (o chat atualiza sozinho enquanto está aberto). */
export async function loadPortalProjectMessages(projectId: string): Promise<ActionResult<PortalMessage[]>> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(projectId)) return { ok: false, error: PROJECT_GONE }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_project_messages", { target_project: projectId })
  if (error) return failure(error, "Não foi possível carregar as mensagens.")
  return { ok: true, data: (data ?? []).map(toPortalMessage) }
}
