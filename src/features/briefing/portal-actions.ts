"use server"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

import {
  BRIEFING_AUDIO_MAX_MS,
  BRIEFING_FILE_MAX_BYTES,
  isBriefingFileType,
  normalizeValue,
  parseAnswerValue,
  parseFiles,
  type AnswerValue,
  type BriefingAudio,
  type BriefingFile,
} from "@/features/briefing/flow-logic"
import { BRIEFING_BUCKET } from "@/features/briefing/storage"
import { queueBriefingAudio } from "@/features/briefing/transcription"
import { getPortalUser } from "@/features/portal/session"
import { AUDIO_MAX_BYTES, baseAudioType } from "@/features/voice/logic"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * O que o cliente faz no briefing (portal): salvar cada resposta, marcar onde
 * parou, gravar e apagar áudios, enviar arquivos, fechar etapa e enviar. Tudo
 * com a sessão do cliente: o RLS deixa gravar só no briefing dele e só
 * enquanto não enviou; fechar etapa e enviar passam pelas funções do banco,
 * que conferem os obrigatórios e avisam a equipe.
 */

const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const BRIEFING_GONE = "Este briefing não está mais aberto. Atualize a página."
const SAVE_FAILED = "Não foi possível salvar. Confira a conexão e tente de novo."
const INVALID_AUDIO = "Não foi possível guardar o áudio. Grave de novo."
const TEXT_MAX = 10000

const DB_ERRORS: Partial<Record<string, string>> = {
  briefing_not_found: BRIEFING_GONE,
  block_not_found: BRIEFING_GONE,
  question_not_found: "Esta pergunta saiu do briefing. Atualize a página.",
  required_missing: "Ainda falta responder uma pergunta obrigatória.",
  invalid_audio: INVALID_AUDIO,
  invalid_file: "Esse arquivo não pôde ser guardado. Envie de novo.",
}

function failure(error: PostgrestError, fallback: string): { ok: false; error: string } {
  const known = DB_ERRORS[error.message]
  if (known) return { ok: false, error: known }
  // RLS: o briefing já foi enviado (ou não é desta conta).
  if (error.code === "42501") return { ok: false, error: BRIEFING_GONE }
  return dbFailure(error, fallback)
}

/** O briefing aberto (liberado e não enviado) da conta, com o cliente dele. */
async function openBriefing(supabase: SupabaseServerClient, briefingId: string): Promise<{ id: string; client_id: string } | null> {
  if (!isUuid(briefingId)) return null
  const { data } = await supabase
    .from("client_briefings")
    .select("id, client_id")
    .eq("id", briefingId)
    .in("status", ["not_started", "in_progress"])
    .maybeSingle()
  return data ?? null
}

async function signedIn(): Promise<boolean> {
  return (await getPortalUser()) !== null
}

export interface AnswerInput {
  text: string
  value: AnswerValue
  files: BriefingFile[]
  skipped: boolean
}

/** Salva a resposta (o banco guarda a cópia da pergunta). Vazia, fica sem valor. */
export async function saveBriefingAnswer(briefingId: string, questionId: string, input: AnswerInput): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(briefingId) || !isUuid(questionId)) return { ok: false, error: BRIEFING_GONE }
  const text = String(input?.text ?? "").trim()
  if (text.length > TEXT_MAX) return { ok: false, error: "A resposta escrita pode ter até 10.000 caracteres." }
  const value = normalizeValue(parseAnswerValue(input?.value))
  if (value && JSON.stringify(value).length > 20000) return { ok: false, error: "A resposta ficou grande demais." }
  const files = parseFiles(input?.files).slice(0, 30)

  const supabase = await createClient()
  const { error } = await supabase.from("briefing_answers").upsert(
    {
      briefing_id: briefingId,
      question_id: questionId,
      text: text || null,
      // Já normalizado: só texto, números, listas e objetos simples.
      value: value ? (JSON.parse(JSON.stringify(value)) as Json) : null,
      files: files.map((file) => ({ ...file })),
      skipped: input?.skipped === true,
    },
    { onConflict: "briefing_id,question_id" }
  )
  if (error) return failure(error, SAVE_FAILED)
  return { ok: true, data: null }
}

/** Onde parou (para voltar exatamente nessa pergunta) e o último acesso. */
export async function setBriefingPosition(briefingId: string, questionId: string | null): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(briefingId) || (questionId !== null && !isUuid(questionId))) return { ok: false, error: BRIEFING_GONE }
  const supabase = await createClient()
  const { error } = await supabase
    .from("client_briefings")
    .update({ current_question_id: questionId, last_seen_at: new Date().toISOString(), status: "in_progress" })
    .eq("id", briefingId)
    .in("status", ["not_started", "in_progress"])
  if (error) return failure(error, SAVE_FAILED)
  return { ok: true, data: null }
}

/**
 * URL assinada para o navegador enviar um áudio ou um arquivo direto ao
 * Storage, na pasta do briefing ("<cliente>/<briefing>/…").
 */
export async function createBriefingUpload(
  briefingId: string,
  kind: "audio" | "file",
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  const type = String(contentType ?? "")
  if (kind === "audio") {
    if (!baseAudioType(type)) return { ok: false, error: "Este navegador gravou um tipo de áudio que não é aceito." }
    if (!Number.isFinite(size) || size <= 0 || size > AUDIO_MAX_BYTES) return { ok: false, error: "O áudio ficou grande demais." }
  } else {
    if (!isBriefingFileType(type)) return { ok: false, error: "Esse tipo de arquivo não é aceito. Use imagem, PDF, vídeo, fonte ou zip." }
    if (!Number.isFinite(size) || size <= 0 || size > BRIEFING_FILE_MAX_BYTES) return { ok: false, error: "O arquivo precisa ter até 50 MB." }
  }

  const supabase = await createClient()
  const briefing = await openBriefing(supabase, briefingId)
  if (!briefing) return { ok: false, error: BRIEFING_GONE }
  const path = `${briefing.client_id}/${briefing.id}/${kind === "audio" ? "" : "files/"}${crypto.randomUUID()}`
  const { data, error } = await supabase.storage.from(BRIEFING_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar. Confira a conexão e tente de novo." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/** Apaga um arquivo enviado que não ficou em nenhuma resposta (o envio desistiu ou o cliente tirou). */
export async function discardBriefingUpload(briefingId: string, path: string): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const briefing = await openBriefing(supabase, briefingId)
  if (!briefing || typeof path !== "string" || !path.startsWith(`${briefing.client_id}/${briefing.id}/`)) {
    return { ok: false, error: BRIEFING_GONE }
  }
  const [audio, file] = await Promise.all([
    supabase.from("briefing_answer_audios").select("id").eq("storage_path", path).limit(1),
    supabase.from("briefing_answers").select("id").eq("briefing_id", briefing.id).contains("files", JSON.stringify([{ path }])).limit(1),
  ])
  if ((audio.data?.length ?? 0) > 0 || (file.data?.length ?? 0) > 0) return { ok: true, data: null }
  const { error } = await supabase.storage.from(BRIEFING_BUCKET).remove([path])
  if (error) console.error(`[storage] ${error.message}`)
  return { ok: true, data: null }
}

/**
 * Guarda o áudio gravado (já enviado ao Storage) na resposta e o põe na fila
 * de transcrição. A resposta nasce aqui, se ainda não existia.
 */
export async function saveBriefingAudio(
  briefingId: string,
  questionId: string,
  path: string,
  durationMs: number
): Promise<ActionResult<BriefingAudio>> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(questionId)) return { ok: false, error: BRIEFING_GONE }
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > BRIEFING_AUDIO_MAX_MS + 5000) {
    return { ok: false, error: INVALID_AUDIO }
  }
  const supabase = await createClient()
  const briefing = await openBriefing(supabase, briefingId)
  if (!briefing) return { ok: false, error: BRIEFING_GONE }
  const [client, owner, file, ...rest] = String(path ?? "").split("/")
  if (client !== briefing.client_id || owner !== briefing.id || !isUuid(file) || rest.length > 0) {
    return { ok: false, error: INVALID_AUDIO }
  }

  const ensured = await supabase
    .from("briefing_answers")
    .upsert({ briefing_id: briefing.id, question_id: questionId, skipped: false }, { onConflict: "briefing_id,question_id", ignoreDuplicates: true })
  if (ensured.error) return failure(ensured.error, INVALID_AUDIO)
  const { data: answer, error: answerError } = await supabase
    .from("briefing_answers")
    .select("id")
    .eq("briefing_id", briefing.id)
    .eq("question_id", questionId)
    .single()
  if (answerError) return failure(answerError, INVALID_AUDIO)

  const { data: audio, error } = await supabase
    .from("briefing_answer_audios")
    .insert({ answer_id: answer.id, briefing_id: briefing.id, storage_path: path, duration_ms: Math.min(durationMs, BRIEFING_AUDIO_MAX_MS) })
    .select("id, duration_ms, created_at")
    .single()
  if (error) return failure(error, INVALID_AUDIO)
  // Gravar o áudio desfaz o "pular por agora".
  await supabase.from("briefing_answers").update({ skipped: false }).eq("id", answer.id).eq("skipped", true)
  await queueBriefingAudio(supabase, { audioId: audio.id, storagePath: path })
  return { ok: true, data: audio }
}

/** Apaga um áudio da resposta (regravar) e o arquivo dele. */
export async function deleteBriefingAudio(briefingId: string, audioId: string): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(audioId)) return { ok: false, error: BRIEFING_GONE }
  const supabase = await createClient()
  const briefing = await openBriefing(supabase, briefingId)
  if (!briefing) return { ok: false, error: BRIEFING_GONE }
  const { data, error } = await supabase
    .from("briefing_answer_audios")
    .delete()
    .eq("id", audioId)
    .eq("briefing_id", briefing.id)
    .select("storage_path")
  if (error) return failure(error, "Não foi possível apagar o áudio.")
  const paths = data.map((row) => row.storage_path)
  if (paths.length > 0) {
    const removed = await supabase.storage.from(BRIEFING_BUCKET).remove(paths)
    if (removed.error) console.error(`[storage] ${removed.error.message}`)
  }
  return { ok: true, data: null }
}

/** Fecha a etapa: confere os obrigatórios dela e avisa a equipe (uma vez por etapa). */
export async function completeBriefingBlock(briefingId: string, blockId: string): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(briefingId) || !isUuid(blockId)) return { ok: false, error: BRIEFING_GONE }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_complete_briefing_block", { target_briefing: briefingId, target_block: blockId })
  if (error) return failure(error, SAVE_FAILED)
  return { ok: true, data: null }
}

/** Envia o briefing (só com os obrigatórios). O resto do portal abre. */
export async function submitBriefing(briefingId: string): Promise<ActionResult> {
  if (!(await signedIn())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(briefingId)) return { ok: false, error: BRIEFING_GONE }
  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_submit_briefing", { target_briefing: briefingId })
  if (error) return failure(error, "Não foi possível enviar o briefing. Tente de novo.")
  revalidatePath("/portal", "layout")
  return { ok: true, data: null }
}
