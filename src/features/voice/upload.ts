import { createAudioUpload, discardAudioUpload } from "@/features/voice/actions"
import { AUDIO_MAX_BYTES, baseAudioType } from "@/features/voice/logic"
import type { ActionResult } from "@/lib/types"

/** O que o gravador entrega: o arquivo, o tipo que o navegador gravou e quanto tempo tem. */
export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
}

/**
 * Envia a gravação ao Storage (direto do navegador, por uma URL assinada que o
 * servidor cria) e chama `send` com o caminho. Se a mensagem não for gravada,
 * o arquivo enviado sai.
 */
export async function deliverRecording<T>(
  recording: Recording,
  send: (path: string) => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  const type = baseAudioType(recording.mimeType || recording.blob.type)
  if (!type) return { ok: false, error: "Este navegador gravou um tipo de áudio que não é aceito." }
  if (recording.blob.size > AUDIO_MAX_BYTES) return { ok: false, error: "O áudio ficou grande demais. Grave um mais curto." }

  const ticket = await createAudioUpload(type, recording.blob.size)
  if (!ticket.ok) return ticket

  const body = new FormData()
  body.append("cacheControl", "3600")
  body.append("", new File([recording.blob], "audio", { type }))
  const response = await fetch(ticket.data.uploadUrl, {
    method: "PUT",
    body,
    headers: {
      "x-upsert": "false",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  }).catch(() => null)
  if (!response?.ok) return { ok: false, error: "Não foi possível enviar o áudio. Confira a conexão e tente de novo." }

  const result = await send(ticket.data.path).catch(() => null)
  if (!result?.ok) {
    await discardAudioUpload(ticket.data.path).catch(() => undefined)
    return result ?? { ok: false, error: "Sem conexão. O áudio não foi enviado." }
  }
  return result
}
