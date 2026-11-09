import type { BriefingAiStatus, BriefingView } from "@/features/briefing/team-logic"
import type { BriefingStatus, Timestamp } from "@/lib/types"

/*
 * Análise do briefing inteiro (issue #108): o que a equipe recebe quando o
 * cliente já respondeu boa parte. Regras puras e sem `node:crypto`, porque o
 * painel (componente do navegador) usa os tipos, o texto para copiar e o
 * corte do botão. A montagem do pedido e a marca ficam em analysis-source.ts.
 */

/** Antes do envio, o botão "Gerar análise agora" pede esta parte das obrigatórias (o banco confere igual). */
export const ANALYSIS_MIN_REQUIRED_SHARE = 0.6

export type AnalysisGapKind = "skipped" | "missing" | "vague" | "example"

export interface AnalysisContent {
  /** O essencial em poucas linhas. */
  key_points: string[]
  /** O que a marca é, para quem e contra o quê. */
  positioning: { what: string; for_whom: string; against: string; summary: string }
  contradictions: { title: string; detail: string; questions: string[] }[]
  gaps: { question: string; kind: AnalysisGapKind; note: string }[]
  meeting_questions: { question: string; why: string }[]
  content_pillars: { name: string; description: string; why: string }[]
}

/** O que a aba da ficha recebe da análise guardada. */
export interface TeamBriefingAnalysis {
  status: BriefingAiStatus
  attempts: number
  /** Null se ainda não há conteúdo válido. */
  content: AnalysisContent | null
  error: string | null
  origin: "submitted" | "manual"
  requested_at: Timestamp
  finished_at: Timestamp | null
  /** As respostas mudaram depois que a análise leu (a marca não bate). */
  stale: boolean
}

/* ------------------------------------------------------------------ */
/* Saída estruturada                                                   */
/* ------------------------------------------------------------------ */

const text = (description: string) => ({ type: "string", description }) as const
const list = (items: object, description: string) => ({ type: "array", items, description }) as const
const object = (properties: Record<string, object>) =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }) as const

/** JSON schema das seções (`output_config.format`). Sem limites numéricos, que a saída estruturada não aceita. */
export const ANALYSIS_SCHEMA = object({
  key_points: list(text("Um ponto importante, numa frase."), "De 3 a 6 pontos com o essencial do briefing."),
  positioning: object({
    what: text("O que a marca é e vende, em uma ou duas frases."),
    for_whom: text("Para quem: o público principal, como o cliente o descreve."),
    against: text("Contra o quê: concorrentes, alternativas ou hábitos dos quais a marca quer se diferenciar."),
    summary: text("A leitura do posicionamento numa frase."),
  }),
  contradictions: list(
    object({
      title: text("A contradição em poucas palavras."),
      detail: text("O que uma resposta diz e o que a outra diz."),
      questions: list(text("Texto da pergunta envolvida."), "As perguntas envolvidas."),
    }),
    "Contradições entre respostas. Vazio se não houver."
  ),
  gaps: list(
    object({
      question: text("Texto da pergunta."),
      kind: { type: "string", enum: ["skipped", "missing", "vague", "example"], description: "skipped: pulada; missing: sem resposta; vague: vaga ou genérica; example: só repete o exemplo da pergunta." },
      note: text("O que falta, em uma frase."),
    }),
    "Lacunas e respostas vagas."
  ),
  meeting_questions: list(
    object({ question: text("Pergunta para a reunião de imersão."), why: text("Por que perguntar, em uma frase.") }),
    "De 4 a 8 perguntas para a reunião de imersão."
  ),
  content_pillars: list(
    object({
      name: text("Nome curto do pilar."),
      description: text("Do que o pilar fala."),
      why: text("Por que este pilar, ligado ao que o cliente respondeu."),
    }),
    "De 3 a 5 pilares de conteúdo."
  ),
})

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null
}

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function cleanList<T>(value: unknown, map: (item: Json) => T | null, max: number): T[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const source = asObject(item)
      return source ? map(source) : null
    })
    .filter((item): item is T => item !== null)
    .slice(0, max)
}

const GAP_KINDS: readonly AnalysisGapKind[] = ["skipped", "missing", "vague", "example"]

/**
 * Lê o conteúdo (do modelo ou do banco) com tolerância: corta tamanhos,
 * descarta itens sem texto. Devolve null se faltar o essencial.
 */
export function parseAnalysisContent(value: unknown): AnalysisContent | null {
  const source = asObject(value)
  if (!source) return null
  const keyPoints = Array.isArray(source.key_points)
    ? source.key_points.map((item) => clean(item, 600)).filter(Boolean).slice(0, 8)
    : []
  const positioning = asObject(source.positioning)
  const content: AnalysisContent = {
    key_points: keyPoints,
    positioning: {
      what: clean(positioning?.what),
      for_whom: clean(positioning?.for_whom),
      against: clean(positioning?.against),
      summary: clean(positioning?.summary),
    },
    contradictions: cleanList(
      source.contradictions,
      (item) => {
        const title = clean(item.title, 200)
        const detail = clean(item.detail)
        if (!title && !detail) return null
        const questions = Array.isArray(item.questions) ? item.questions.map((q) => clean(q, 300)).filter(Boolean).slice(0, 4) : []
        return { title: title || detail.slice(0, 80), detail, questions }
      },
      8
    ),
    gaps: cleanList(
      source.gaps,
      (item) => {
        const question = clean(item.question, 300)
        if (!question) return null
        const kind = GAP_KINDS.includes(item.kind as AnalysisGapKind) ? (item.kind as AnalysisGapKind) : "vague"
        return { question, kind, note: clean(item.note, 600) }
      },
      20
    ),
    meeting_questions: cleanList(
      source.meeting_questions,
      (item) => {
        const question = clean(item.question, 400)
        return question ? { question, why: clean(item.why, 400) } : null
      },
      12
    ),
    content_pillars: cleanList(
      source.content_pillars,
      (item) => {
        const name = clean(item.name, 120)
        return name ? { name, description: clean(item.description, 600), why: clean(item.why, 600) } : null
      },
      6
    ),
  }
  if (content.key_points.length === 0 || !content.positioning.summary) return null
  return content
}

/* ------------------------------------------------------------------ */
/* Botão e estado                                                      */
/* ------------------------------------------------------------------ */

export interface AnalysisReadiness {
  requiredAnswered: number
  requiredTotal: number
  /** Pode pedir a análise agora (enviado, ou com o corte das obrigatórias). */
  canRequest: boolean
  /** Quantas obrigatórias faltam para o corte (0 se já pode). */
  missingForCut: number
}

/** O corte do botão, com as obrigatórias que contam neste briefing (a mesma conta do banco). */
export function analysisReadiness(view: Pick<BriefingView, "sections">, status: BriefingStatus): AnalysisReadiness {
  let requiredTotal = 0
  let requiredAnswered = 0
  for (const section of view.sections) {
    for (const item of section.items) {
      if (item.retired || !item.question.required) continue
      requiredTotal += 1
      if (item.filled) requiredAnswered += 1
    }
  }
  const open = status === "preparing" || status === "not_started" || status === "in_progress"
  const needed = Math.ceil(requiredTotal * ANALYSIS_MIN_REQUIRED_SHARE)
  const enough = requiredTotal > 0 && requiredAnswered >= needed
  return {
    requiredAnswered,
    requiredTotal,
    canRequest: !open || enough,
    missingForCut: open && !enough && requiredTotal > 0 ? needed - requiredAnswered : 0,
  }
}

export function isAnalysisRunning(analysis: Pick<TeamBriefingAnalysis, "status"> | null): boolean {
  return analysis?.status === "pending" || analysis?.status === "processing"
}

/** Falhou de vez (3 tentativas, ou recusa): só volta pelo botão. */
export function isAnalysisGivenUp(analysis: Pick<TeamBriefingAnalysis, "status" | "attempts"> | null): boolean {
  return analysis?.status === "failed" && analysis.attempts >= 3
}

export const ANALYSIS_GAP_LABEL: Record<AnalysisGapKind, string> = {
  skipped: "Pulada",
  missing: "Sem resposta",
  vague: "Vaga",
  example: "Repete o exemplo",
}

/* ------------------------------------------------------------------ */
/* Copiar como contexto                                                */
/* ------------------------------------------------------------------ */

/** A análise em texto limpo, para colar como contexto (num chat, num documento). */
export function analysisToText(content: AnalysisContent, brandName: string): string {
  const lines: string[] = []
  const section = (title: string) => {
    if (lines.length > 0) lines.push("")
    lines.push(title.toUpperCase())
  }
  lines.push(`Análise do briefing${brandName.trim() ? ` — ${brandName.trim()}` : ""}`)

  section("Pontos importantes")
  for (const point of content.key_points) lines.push(`- ${point}`)

  section("Leitura do posicionamento")
  lines.push(content.positioning.summary)
  if (content.positioning.what) lines.push(`- O que é: ${content.positioning.what}`)
  if (content.positioning.for_whom) lines.push(`- Para quem: ${content.positioning.for_whom}`)
  if (content.positioning.against) lines.push(`- Contra o quê: ${content.positioning.against}`)

  section("Contradições")
  if (content.contradictions.length === 0) lines.push("- Nenhuma encontrada.")
  for (const item of content.contradictions) {
    lines.push(`- ${item.title}${item.detail ? `: ${item.detail}` : ""}`)
    if (item.questions.length > 0) lines.push(`  (${item.questions.join(" / ")})`)
  }

  section("Lacunas e respostas vagas")
  if (content.gaps.length === 0) lines.push("- Nenhuma.")
  for (const gap of content.gaps) {
    lines.push(`- [${ANALYSIS_GAP_LABEL[gap.kind]}] ${gap.question}${gap.note ? ` — ${gap.note}` : ""}`)
  }

  section("Perguntas para a reunião de imersão")
  content.meeting_questions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.question}${item.why ? ` (${item.why})` : ""}`)
  })

  section("Pilares de conteúdo (primeira proposta)")
  content.content_pillars.forEach((pillar, index) => {
    lines.push(`${index + 1}. ${pillar.name}${pillar.description ? `: ${pillar.description}` : ""}`)
    if (pillar.why) lines.push(`   Por quê: ${pillar.why}`)
  })

  return lines.join("\n")
}
