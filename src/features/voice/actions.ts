"use server"

import type { PostgrestError } from "@supabase/supabase-js"

import { getSessionUser, requireUser } from "@/features/auth/session"
import type { ThreadMessage } from "@/features/channels/logic"
import { MESSAGE_COLUMNS } from "@/features/channels/queries"
import { isWritableKind, type WritableKind } from "@/features/channels/validation"
import { getPortalUser } from "@/features/portal/session"
import { AUDIO_MAX_BYTES, baseAudioType, isAudioDuration, isAudioPath, MESSAGE_AUDIO_BUCKET } from "@/features/voice/logic"
import { withAudio } from "@/features/voice/queries"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions das mensagens de voz, na equipe e no portal. O áudio vai do
 * navegador direto ao Storage (bucket `message-audio`, na pasta de quem
 * gravou) por uma URL assinada; depois uma função do banco grava a mensagem
 * e o áudio juntos, com o tipo e o tamanho que o Storage registrou.
 */

const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const INVALID_AUDIO = "Não foi possível enviar o áudio. Grave de novo."

/** Quem está gravando: alguém da equipe ou uma conta do portal. */
async function currentUserId(): Promise<string | null> {
  const team = await getSessionUser()
  if (team) return team.id
  return (await getPortalUser())?.id ?? null
}

function audioFailure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  if (error.message === "channel_not_found") return { ok: false, error: "Essa conversa não está mais disponível." }
  if (error.message === "invalid_audio") return { ok: false, error: INVALID_AUDIO }
  if (error.message.includes("arquivado")) return { ok: false, error: "A conversa foi arquivada." }
  if (error.message.includes("interna")) return { ok: false, error: "Mensagem interna só no canal do cliente." }
  if (error.code === "23514") return { ok: false, error: "O post ou o projeto precisa ser do cliente deste canal." }
  if (error.code === "PGRST202") return { ok: false, error: "As mensagens de voz ainda não foram ligadas. Avise a equipe." }
  return dbFailure(error, fallback)
}

/** URL assinada para o navegador enviar o áudio e o caminho `<quem grava>/<uuid>`. */
export async function createAudioUpload(contentType: string, size: number): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: SIGNED_OUT }
  if (typeof contentType !== "string" || !baseAudioType(contentType)) {
    return { ok: false, error: "Este navegador gravou um tipo de áudio que não é aceito." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > AUDIO_MAX_BYTES) {
    return { ok: false, error: "O áudio ficou grande demais. Grave um mais curto." }
  }

  const path = `${userId}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(MESSAGE_AUDIO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: INVALID_AUDIO }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/** Apaga um áudio enviado que não virou mensagem (o envio falhou). */
export async function discardAudioUpload(path: string): Promise<ActionResult> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: SIGNED_OUT }
  if (!isAudioPath(path, userId)) return { ok: false, error: INVALID_AUDIO }
  const supabase = await createClient()
  const { data } = await supabase.from("message_audio").select("message_id").eq("storage_path", path).limit(1)
  if (data && data.length > 0) return { ok: true, data: null }
  const { error } = await supabase.storage.from(MESSAGE_AUDIO_BUCKET).remove([path])
  if (error) console.error(`[storage] ${error.message}`)
  return { ok: true, data: null }
}

export interface AudioMessageInput {
  channel_id: string
  path: string
  duration_ms: number
  kind: WritableKind
  post_id: string | null
  project_id?: string | null
  internal?: boolean
}

/** A equipe envia a mensagem de voz (as mesmas regras de escrever no canal). */
export async function sendAudioMessage(input: AudioMessageInput): Promise<ActionResult<ThreadMessage>> {
  const user = await requireUser()
  if (!input || !isUuid(input.channel_id)) return { ok: false, error: "Esse canal não existe mais." }
  if (!isAudioPath(input.path, user.id) || !isAudioDuration(input.duration_ms)) return { ok: false, error: INVALID_AUDIO }
  if (!isWritableKind(input.kind)) return { ok: false, error: "Tipo de mensagem inválido." }
  if (input.post_id !== null && !isUuid(input.post_id)) return { ok: false, error: "Post inválido." }
  if (input.project_id != null && !isUuid(input.project_id)) return { ok: false, error: "Projeto inválido." }

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc("send_audio_message", {
    target_channel: input.channel_id,
    audio_path: input.path,
    duration_ms: input.duration_ms,
    message_kind: input.kind,
    ...(input.post_id ? { target_post: input.post_id } : {}),
    ...(input.project_id ? { target_project: input.project_id } : {}),
    is_internal: input.internal === true,
  })
  if (error) return audioFailure(error, "Não foi possível enviar o áudio.")
  const { data: message, error: readError } = await supabase.from("messages").select(MESSAGE_COLUMNS).eq("id", id).single()
  if (readError) return dbFailure(readError, "O áudio foi enviado, mas não deu para mostrar. Atualize a conversa.")
  const [withFile] = await withAudio(supabase, [message])
  return { ok: true, data: withFile ?? message }
}

/** O cliente envia a mensagem de voz no canal do cliente. */
export async function sendPortalChannelAudio(clientId: string, path: string, durationMs: number): Promise<ActionResult> {
  const user = await getPortalUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(clientId)) return { ok: false, error: "A conversa com a equipe não está disponível. Avise a equipe." }
  if (!isAudioPath(path, user.id) || !isAudioDuration(durationMs)) return { ok: false, error: INVALID_AUDIO }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_send_channel_audio", { target_client: clientId, audio_path: path, duration_ms: durationMs })
  if (error) return audioFailure(error, "Não foi possível enviar o áudio.")
  return { ok: true, data: null }
}

/** A pessoa do cliente envia a mensagem de voz na conversa direta. */
export async function sendPortalDirectAudio(channelId: string, path: string, durationMs: number): Promise<ActionResult> {
  const user = await getPortalUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(channelId)) return { ok: false, error: "Essa conversa não está mais disponível." }
  if (!isAudioPath(path, user.id) || !isAudioDuration(durationMs)) return { ok: false, error: INVALID_AUDIO }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_send_direct_audio", { target_channel: channelId, audio_path: path, duration_ms: durationMs })
  if (error) return audioFailure(error, "Não foi possível enviar o áudio.")
  return { ok: true, data: null }
}
