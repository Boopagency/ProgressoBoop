"use server"

import type { PostgrestError } from "@supabase/supabase-js"

import { fetchPortalThread, type PortalChannelMessage } from "@/features/portal/channel-queries"
import { MESSAGE_MAX } from "@/features/portal/content-logic"
import { getPortalUser } from "@/features/portal/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, Timestamp } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Comunicação no portal: o cliente lê e escreve no canal do cliente e marca
 * até onde leu, só pelas funções `portal_*` (o banco confere o cliente, deixa
 * de fora as mensagens internas e confere o texto). Nada recarrega a tela: o
 * fio busca de novo sozinho.
 */

const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const CHANNEL_GONE = "A conversa com a equipe não está disponível. Avise a equipe."
const INVALID_BODY = "Escreva uma mensagem de até 5.000 caracteres."

/** Erros das funções do portal (a mensagem do banco é o código). */
const PORTAL_ERRORS: Partial<Record<string, string>> = {
  channel_not_found: CHANNEL_GONE,
  invalid_body: INVALID_BODY,
  invalid_read: "Não foi possível marcar como lida.",
}

function failure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  const known = PORTAL_ERRORS[error.message]
  if (known) return { ok: false, error: known }
  // Canal arquivado pela equipe (trigger set_message_fields).
  if (error.message.includes("arquivado")) return { ok: false, error: "A conversa foi encerrada pela equipe." }
  return dbFailure(error, fallback)
}

function isTimestamp(value: unknown): value is Timestamp {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
}

/** Uma página do fio (as mais recentes ou as de antes de `olderThan`). */
export async function loadPortalThread(
  clientId: string,
  olderThan?: Timestamp
): Promise<ActionResult<{ messages: PortalChannelMessage[]; hasMore: boolean }>> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(clientId)) return { ok: false, error: CHANNEL_GONE }
  if (olderThan !== undefined && !isTimestamp(olderThan)) return { ok: false, error: "Não foi possível carregar as mensagens." }
  const supabase = await createClient()
  try {
    return { ok: true, data: await fetchPortalThread(supabase, clientId, olderThan) }
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Não foi possível carregar as mensagens." }
  }
}

export async function sendPortalChannelMessage(clientId: string, body: string): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(clientId)) return { ok: false, error: CHANNEL_GONE }
  const text = String(body ?? "").trim()
  if (!text || text.length > MESSAGE_MAX) return { ok: false, error: INVALID_BODY }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_send_channel_message", { target_client: clientId, message_body: text })
  if (error) return failure(error, "Não foi possível enviar a mensagem.")
  return { ok: true, data: null }
}

/**
 * A conta leu o canal até a mensagem mais nova que viu (a hora como veio do
 * banco). O banco nunca volta a leitura para trás e marca como lidos os
 * avisos dessas mensagens.
 */
export async function readPortalChannel(clientId: string, readUntil: Timestamp): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(clientId) || !isTimestamp(readUntil)) return { ok: false, error: "Não foi possível marcar como lida." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_read_channel", { target_client: clientId, read_until: readUntil })
  if (error) return failure(error, "Não foi possível marcar como lida.")
  return { ok: true, data: null }
}
