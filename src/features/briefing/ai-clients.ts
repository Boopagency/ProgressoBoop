import {
  AiCallError,
  apiErrorMessage,
  audioFileName,
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

/** Baixa o áudio pela URL assinada e transcreve em português. */
export async function transcribeAudio(input: TranscribeInput): Promise<string> {
  const audio = await input.fetch(input.signedUrl, { signal: timeLeft(input.deadline) })
  if (!audio.ok) {
    throw new AiCallError(`O áudio não pôde ser baixado (${audio.status}).`, outcomeForDownload(audio.status))
  }
  const bytes = await audio.arrayBuffer()
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
