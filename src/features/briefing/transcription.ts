import "server-only"

import { after } from "next/server"

import { briefingAiKeys, briefingJobsSecret } from "@/features/briefing/ai-config"
import { AUDIO_URL_TTL_SECONDS } from "@/features/briefing/ai-logic"
import { processBriefingJobs } from "@/features/briefing/jobs"
import { supabaseEnv } from "@/lib/supabase/env"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Transcrição dos áudios do briefing (issue #108, Parte 3).
 *
 * O fluxo do cliente chama `queueBriefingAudio` logo depois de gravar a linha
 * em `briefing_answer_audios`, com a sessão do cliente. O banco já criou a
 * transcrição "pendente" (trigger `queue_briefing_transcription`) e marcou o
 * resumo da resposta como pendente. Aqui: assina a URL do áudio (o job roda
 * sem sessão e o bucket é privado), entrega à fila por queue_briefing_audio
 * (que confere que o áudio é de um briefing aberto da conta) e processa na
 * hora com `after()`. O cron de cada minuto pega o que ficar para trás.
 *
 * Nunca falha para quem chamou: o áudio já está salvo e o cliente não espera
 * a transcrição. Problemas vão para o log.
 */

const BRIEFING_BUCKET = "briefing"
/** O processamento logo depois de salvar não passa disto. */
const IMMEDIATE_BUDGET_MS = 50_000

export interface QueueBriefingAudioInput {
  /** Id da linha em `briefing_answer_audios`. */
  audioId: string
  /** Caminho do arquivo no bucket `briefing` ("<cliente>/<briefing>/<uuid>"). */
  storagePath: string
}

export async function queueBriefingAudio(supabase: SupabaseServerClient, input: QueueBriefingAudioInput): Promise<void> {
  const { data: signed, error: signError } = await supabase.storage
    .from(BRIEFING_BUCKET)
    .createSignedUrl(input.storagePath, AUDIO_URL_TTL_SECONDS)
  if (signError || !signed?.signedUrl.startsWith("https://")) {
    console.error(`[briefing] URL do áudio ${input.audioId}: ${signError?.message ?? "sem https"}`)
    return
  }

  // Um minuto de folga para o relógio do Storage.
  const expiresAt = new Date(Date.now() + (AUDIO_URL_TTL_SECONDS - 60) * 1000).toISOString()
  const { error } = await supabase.rpc("queue_briefing_audio", {
    p_audio_id: input.audioId,
    p_signed_url: signed.signedUrl,
    p_url_expires_at: expiresAt,
  })
  if (error) {
    console.error(`[briefing] fila do áudio ${input.audioId}: ${error.message}`)
    return
  }

  const secret = briefingJobsSecret()
  const keys = briefingAiKeys()
  if (!secret || !keys.openai) return
  const deadline = Date.now() + IMMEDIATE_BUDGET_MS
  try {
    after(() => processBriefingJobs({ supabase, secret, keys, supabaseUrl: supabaseEnv().url, deadline }))
  } catch (thrown) {
    // Fora de uma requisição (não deveria acontecer): o cron processa.
    console.error(`[briefing] processamento imediato: ${thrown instanceof Error ? thrown.message : thrown}`)
  }
}
