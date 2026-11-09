import {
  AiCallError,
  apiErrorMessage,
  audioFileName,
  MAX_AUDIO_BYTES,
  outcomeForDownload,
  outcomeForStatus,
  SUMMARY_MODEL,
  SUMMARY_SYSTEM,
  summaryFromMessage,
  summaryUserMessage,
  TRANSCRIPTION_MODEL,
  transcriptionPrompt,
  type SummarySource,
} from "@/features/briefing/ai-logic"
import { ANALYSIS_SCHEMA, type AnalysisContent } from "@/features/briefing/analysis-logic"
import {
  ANALYSIS_MODEL,
  ANALYSIS_SYSTEM,
  analysisFromMessage,
  analysisUserMessage,
  type AnalysisSource,
} from "@/features/briefing/analysis-source"

/*
 * Chamadas às APIs de IA, com `fetch` direto (sem SDK). O `fetch` vem por
 * parâmetro para os testes simularem a rede. Erros saem como AiCallError,
 * com o que fazer (tentar de novo, desistir, adiar).
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2026-10-21"

async function jsonOrNull(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

export interface TranscribeInput {
  signedUrl: string
  mimeType: string
  question: string | null
  apiKey: string
  /** Até quando pode esperar (ms desde a época). */
  deadline: number
  fetch: FetchLike
}

function timeLeft(deadline: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1000, deadline - Date.now()))
}

const TOO_LARGE = "O áudio passa de 10 MB."

/** Lê o corpo até `limit` bytes; passou, para de baixar. */
async function readLimited(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {})
    throw new AiCallError(TOO_LARGE, "final")
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => {})
      throw new AiCallError(TOO_LARGE, "final")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Baixa o áudio pela URL assinada (já conferida por isBriefingAudioUrl, sem
 * seguir redirecionamento e com até 10 MB) e transcreve em português.
 */
export async function transcribeAudio(input: TranscribeInput): Promise<string> {
  const audio = await input.fetch(input.signedUrl, { redirect: "error", signal: timeLeft(input.deadline) })
  if (!audio.ok) {
    throw new AiCallError(`O áudio não pôde ser baixado (${audio.status}).`, outcomeForDownload(audio.status))
  }
  const bytes = await readLimited(audio, MAX_AUDIO_BYTES)
  if (bytes.byteLength === 0) throw new AiCallError("O arquivo do áudio está vazio.", "final")

  const form = new FormData()
  form.append("file", new Blob([bytes], { type: input.mimeType || "audio/webm" }), audioFileName(input.mimeType))
  form.append("model", TRANSCRIPTION_MODEL)
  form.append("language", "pt")
  form.append("response_format", "json")
  const prompt = transcriptionPrompt(input.question)
  if (prompt) form.append("prompt", prompt)

  const response = await input.fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
    signal: timeLeft(input.deadline),
  })
  const body = await jsonOrNull(response)
  if (!response.ok) {
    throw new AiCallError(apiErrorMessage("A OpenAI", response.status, body), outcomeForStatus(response.status))
  }
  const text = (body as { text?: unknown } | null)?.text
  if (typeof text !== "string") throw new AiCallError("A OpenAI não devolveu o texto.", "retry")
  return text.trim()
}

export interface SummarizeInput {
  source: SummarySource
  missingAudios: number
  apiKey: string
  deadline: number
  fetch: FetchLike
}

/** Resume a resposta com o Claude Haiku. */
export async function summarizeAnswer(input: SummarizeInput): Promise<string> {
  const response = await input.fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 4000,
      // Resumo direto: pouco raciocínio, resposta rápida.
      output_config: { effort: "low" },
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: summaryUserMessage(input.source, input.missingAudios) }],
    }),
    signal: timeLeft(input.deadline),
  })
  const body = await jsonOrNull(response)
  if (!response.ok) {
    throw new AiCallError(apiErrorMessage("A Anthropic", response.status, body), outcomeForStatus(response.status))
  }
  const result = summaryFromMessage(body)
  if (!result.ok) throw new AiCallError(result.error, result.outcome)
  return result.text
}

export interface AnalyzeInput {
  source: AnalysisSource
  apiKey: string
  deadline: number
  fetch: FetchLike
}

/**
 * Analisa o briefing inteiro com o Claude Opus: esforço médio e saída
 * estruturada no JSON schema das seções. Sem `temperature`, sem orçamento de
 * raciocínio e sem prefill (o modelo não aceita).
 */
export async function analyzeBriefing(input: AnalyzeInput): Promise<AnalysisContent> {
  const response = await input.fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: 16000,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
      },
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: analysisUserMessage(input.source) }],
    }),
    signal: timeLeft(input.deadline),
  })
  const body = await jsonOrNull(response)
  if (!response.ok) {
    throw new AiCallError(apiErrorMessage("A Anthropic", response.status, body), outcomeForStatus(response.status))
  }
  const result = analysisFromMessage(body)
  if (!result.ok) throw new AiCallError(result.error, result.outcome)
  return result.content
}
