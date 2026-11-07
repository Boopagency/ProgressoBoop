import { summarizeAnswer, transcribeAudio, type FetchLike } from "@/features/briefing/ai-clients"
import {
  hasSummaryContent,
  outcomeForThrown,
  SUMMARY_MODEL,
  summarySourceHash,
  TRANSCRIPTION_MODEL,
  type FailureOutcome,
  type SummarySource,
} from "@/features/briefing/ai-logic"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Uma rodada do processamento do briefing, sem sessão: pede ao banco as
 * transcrições pendentes, transcreve, grava; depois os resumos das respostas
 * que já têm todos os áudios transcritos. Tudo pelas funções que conferem o
 * segredo do Vault. Chamada pela rota /api/briefing/jobs (cron) e logo depois
 * de salvar um áudio (`after()` em queueBriefingAudio).
 *
 * Sem a chave de uma das IAs, aquela etapa nem pede itens ao banco: eles
 * ficam pendentes, sem erro no log e sem gastar tentativa.
 */

export interface BriefingAiKeys {
  openai: string | null
  anthropic: string | null
}

export interface BriefingJobsInput {
  supabase: Pick<SupabaseServerClient, "rpc">
  secret: string
  keys: BriefingAiKeys
  /** Até quando pode trabalhar (ms desde a época). */
  deadline: number
  fetch?: FetchLike
}

export interface BriefingJobsResult {
  transcribed: number
  summarized: number
  failed: number
}

/** Só pede novas transcrições se der tempo de terminar (um áudio de 3 min leva uns 15 s). */
const TRANSCRIBE_RESERVE_MS = 30_000
const SUMMARIZE_RESERVE_MS = 12_000
const TRANSCRIBE_BATCH = 3
const SUMMARIZE_BATCH = 5

interface TranscriptionDue {
  audio_id: string
  signed_url: string
  mime_type: string
  question: string | null
}

interface SummaryDue {
  answer_id: string
  question: unknown
  answer_text: string | null
  transcripts: string[] | null
  missing_audios: number
  source_hash: string | null
  previous_summary: string | null
}

export async function processBriefingJobs(input: BriefingJobsInput): Promise<BriefingJobsResult> {
  const { supabase, secret, keys, deadline } = input
  const fetchImpl: FetchLike = input.fetch ?? ((url, init) => fetch(url, init))
  const result: BriefingJobsResult = { transcribed: 0, summarized: 0, failed: 0 }

  async function fail(kind: "transcription" | "summary", id: string, outcome: FailureOutcome, message: string) {
    const { error } =
      kind === "transcription"
        ? await supabase.rpc("briefing_transcription_failed", {
            p_secret: secret,
            p_audio_id: id,
            p_error: message,
            p_outcome: outcome,
          })
        : await supabase.rpc("briefing_summary_failed", {
            p_secret: secret,
            p_answer_id: id,
            p_error: message,
            p_outcome: outcome,
          })
    if (error) console.error(`[briefing] ${kind} ${id}: ${error.message}`)
    if (outcome !== "defer") {
      result.failed++
      console.error(`[briefing] ${kind} ${id} (${outcome}): ${message}`)
    }
  }

  // Transcrições.
  if (keys.openai) {
    let keyRejected = false
    while (!keyRejected && Date.now() < deadline - TRANSCRIBE_RESERVE_MS) {
      const { data, error } = await supabase.rpc("briefing_transcriptions_due", {
        p_secret: secret,
        p_limit: TRANSCRIBE_BATCH,
      })
      if (error) {
        console.error(`[briefing] transcrições pendentes: ${error.message}`)
        break
      }
      const rows = (data ?? []) as TranscriptionDue[]
      if (rows.length === 0) break
      await Promise.all(
        rows.map(async (row) => {
          try {
            const transcript = await transcribeAudio({
              signedUrl: row.signed_url,
              mimeType: row.mime_type,
              question: row.question,
              apiKey: keys.openai as string,
              deadline,
              fetch: fetchImpl,
            })
            const { error: saveError } = await supabase.rpc("briefing_transcription_done", {
              p_secret: secret,
              p_audio_id: row.audio_id,
              p_transcript: transcript,
              p_model: TRANSCRIPTION_MODEL,
            })
            if (saveError) console.error(`[briefing] transcrição ${row.audio_id}: ${saveError.message}`)
            else result.transcribed++
          } catch (thrown) {
            const { outcome, message } = outcomeForThrown(thrown)
            if (outcome === "defer") keyRejected = true
            await fail("transcription", row.audio_id, outcome, message)
          }
        })
      )
      if (keyRejected) console.error("[briefing] a OpenAI recusou a chave: as transcrições ficam pendentes.")
    }
  }

  // Resumos.
  if (keys.anthropic) {
    let keyRejected = false
    while (!keyRejected && Date.now() < deadline - SUMMARIZE_RESERVE_MS) {
      const { data, error } = await supabase.rpc("briefing_summaries_due", {
        p_secret: secret,
        p_limit: SUMMARIZE_BATCH,
      })
      if (error) {
        console.error(`[briefing] resumos pendentes: ${error.message}`)
        break
      }
      const rows = (data ?? []) as SummaryDue[]
      if (rows.length === 0) break
      await Promise.all(
        rows.map(async (row) => {
          const source: SummarySource = {
            question: row.question && typeof row.question === "object" ? (row.question as SummarySource["question"]) : null,
            text: row.answer_text,
            transcripts: row.transcripts ?? [],
          }
          if (!hasSummaryContent(source)) {
            await fail(
              "summary",
              row.answer_id,
              "final",
              row.missing_audios > 0 ? "Os áudios não puderam ser transcritos." : "A resposta não tem texto nem fala para resumir."
            )
            return
          }
          const hash = summarySourceHash(source)
          try {
            // Nada mudou no que se resume (ex.: só um complemento estruturado): mantém o resumo.
            const summary =
              row.source_hash === hash && row.previous_summary
                ? row.previous_summary
                : await summarizeAnswer({
                    source,
                    missingAudios: row.missing_audios,
                    apiKey: keys.anthropic as string,
                    deadline,
                    fetch: fetchImpl,
                  })
            const { error: saveError } = await supabase.rpc("briefing_summary_done", {
              p_secret: secret,
              p_answer_id: row.answer_id,
              p_summary: summary,
              p_model: SUMMARY_MODEL,
              p_source_hash: hash,
            })
            if (saveError) console.error(`[briefing] resumo ${row.answer_id}: ${saveError.message}`)
            else result.summarized++
          } catch (thrown) {
            const { outcome, message } = outcomeForThrown(thrown)
            if (outcome === "defer") keyRejected = true
            await fail("summary", row.answer_id, outcome, message)
          }
        })
      )
      if (keyRejected) console.error("[briefing] a Anthropic recusou a chave: os resumos ficam pendentes.")
    }
  }

  if (result.transcribed || result.summarized || result.failed) {
    console.info(
      `[briefing] transcritos: ${result.transcribed}, resumidos: ${result.summarized}, com falha: ${result.failed}`
    )
  }
  return result
}
