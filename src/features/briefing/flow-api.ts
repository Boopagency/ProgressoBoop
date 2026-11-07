import type { AnswerValue, BriefingAudio, BriefingFile } from "@/features/briefing/flow-logic"
import {
  completeBriefingBlock,
  createBriefingUpload,
  deleteBriefingAudio,
  discardBriefingUpload,
  saveBriefingAnswer,
  saveBriefingAudio,
  setBriefingPosition,
  submitBriefing,
} from "@/features/briefing/portal-actions"
import { baseAudioType } from "@/features/voice/logic"
import type { Recording } from "@/features/voice/upload"
import type { ActionResult } from "@/lib/types"

/*
 * O que o fluxo do briefing chama no servidor. No portal, as Server Actions;
 * na vitrine, uma versão de mentira que só responde "ok" (nada vai ao banco).
 */

export interface SavedAnswer {
  text: string
  value: AnswerValue
  files: BriefingFile[]
  skipped: boolean
}

export interface BriefingApi {
  saveAnswer: (questionId: string, answer: SavedAnswer) => Promise<ActionResult>
  setPosition: (questionId: string | null) => Promise<ActionResult>
  recordAudio: (questionId: string, recording: Recording) => Promise<ActionResult<BriefingAudio>>
  deleteAudio: (audioId: string) => Promise<ActionResult>
  uploadFile: (file: File) => Promise<ActionResult<BriefingFile>>
  discardFile: (path: string) => Promise<ActionResult>
  completeBlock: (blockId: string) => Promise<ActionResult>
  submit: () => Promise<ActionResult>
}

const NO_CONNECTION = "Sem conexão. Confira a internet e tente de novo."

/** Manda o arquivo ao Storage pela URL assinada (direto do navegador). */
async function putToStorage(uploadUrl: string, blob: Blob, type: string, name: string): Promise<boolean> {
  const body = new FormData()
  body.append("cacheControl", "3600")
  body.append("", new File([blob], name, { type }))
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body,
    headers: { "x-upsert": "false", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
  }).catch(() => null)
  return response?.ok ?? false
}

/** A API de verdade, com as Server Actions do briefing. */
export function serverBriefingApi(briefingId: string): BriefingApi {
  const safe = async <T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    try {
      return await run()
    } catch {
      return { ok: false, error: NO_CONNECTION }
    }
  }
  return {
    saveAnswer: (questionId, answer) => safe(() => saveBriefingAnswer(briefingId, questionId, answer)),
    setPosition: (questionId) => safe(() => setBriefingPosition(briefingId, questionId)),
    recordAudio: (questionId, recording) =>
      safe(async () => {
        const type = baseAudioType(recording.mimeType || recording.blob.type)
        if (!type) return { ok: false, error: "Este navegador gravou um tipo de áudio que não é aceito." }
        const ticket = await createBriefingUpload(briefingId, "audio", type, recording.blob.size)
        if (!ticket.ok) return ticket
        if (!(await putToStorage(ticket.data.uploadUrl, recording.blob, type, "audio"))) {
          return { ok: false, error: "Não foi possível enviar o áudio. Confira a conexão e tente de novo." }
        }
        const saved = await saveBriefingAudio(briefingId, questionId, ticket.data.path, recording.durationMs)
        if (!saved.ok) await discardBriefingUpload(briefingId, ticket.data.path).catch(() => undefined)
        return saved
      }),
    deleteAudio: (audioId) => safe(() => deleteBriefingAudio(briefingId, audioId)),
    uploadFile: (file) =>
      safe(async () => {
        const ticket = await createBriefingUpload(briefingId, "file", file.type, file.size)
        if (!ticket.ok) return ticket
        if (!(await putToStorage(ticket.data.uploadUrl, file, file.type, file.name))) {
          return { ok: false, error: `Não foi possível enviar ${file.name}. Tente de novo.` }
        }
        return { ok: true, data: { path: ticket.data.path, name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size } }
      }),
    discardFile: (path) => safe(() => discardBriefingUpload(briefingId, path)),
    completeBlock: (blockId) => safe(() => completeBriefingBlock(briefingId, blockId)),
    submit: () => safe(() => submitBriefing(briefingId)),
  }
}

/** Vitrine: tudo dá certo e nada sai do navegador. */
export function demoBriefingApi(): BriefingApi {
  const ok = async () => ({ ok: true as const, data: null })
  return {
    saveAnswer: ok,
    setPosition: ok,
    recordAudio: async (_questionId, recording) => ({
      ok: true,
      data: { id: crypto.randomUUID(), duration_ms: recording.durationMs, created_at: new Date().toISOString() },
    }),
    deleteAudio: ok,
    uploadFile: async (file) => ({
      ok: true,
      data: { path: `demo/${crypto.randomUUID()}`, name: file.name, mime_type: file.type, size_bytes: file.size },
    }),
    discardFile: ok,
    completeBlock: ok,
    submit: ok,
  }
}
