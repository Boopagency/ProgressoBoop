import { isBriefingOpen } from "@/features/briefing/logic"
import { meetingEntry, meetingsOverview, recordDate } from "@/features/meetings/logic"
import { isDateKey } from "@/lib/dates"
import type { Database } from "@/lib/supabase/database.types"
import type { BriefingStatus, CalendarEvent, DateKey, MeetingRecord, Timestamp } from "@/lib/types"

/*
 * Visão da equipe do briefing (issue #108, Parte 2): respostas por bloco, o
 * que falta, a sequência de status e a leitura das respostas fechadas.
 * Funções puras; a tela e as Server Actions usam estas regras.
 */

export type BriefingQuestionKind = Database["public"]["Enums"]["briefing_question_kind"]
export type BriefingAiStatus = Database["public"]["Enums"]["briefing_ai_status"]

/* ------------------------------------------------------------------ */
/* Opções da pergunta (jsonb `options`)                                */
/* ------------------------------------------------------------------ */

export interface BriefingChoice {
  value: string
  label: string
  example?: string
}

export interface BriefingToneCard {
  value: string
  label: string
  description?: string
  example?: string
}

export interface BriefingField {
  key: string
  label: string
  placeholder?: string
}

/** Tipos que um complemento (`extras`) pode ter. */
export type BriefingExtraKind = "short_text" | "audio" | "palette" | "links"

export interface BriefingExtra {
  key: string
  kind: BriefingExtraKind
  label: string
  placeholder?: string
  required?: boolean
}

/** O `options` de uma pergunta, lido com tolerância (o que não se entende fica de fora). */
export interface BriefingQuestionOptions {
  choices?: BriefingChoice[]
  cards?: BriefingToneCard[]
  max?: number
  primary?: boolean
  other?: boolean
  voice?: "essential"
  unit?: "BRL"
  accept?: string[]
  fields?: BriefingField[]
  extras?: BriefingExtra[]
  placeholder?: string
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export const EXTRA_KINDS: readonly BriefingExtraKind[] = ["short_text", "audio", "palette", "links"]

export function parseQuestionOptions(value: unknown): BriefingQuestionOptions {
  const source = asObject(value) ?? {}
  const result: BriefingQuestionOptions = {}

  const choices = asArray(source.choices)
    .map(asObject)
    .filter((item): item is JsonObject => item !== null && typeof item.value === "string" && typeof item.label === "string")
    .map((item) => ({ value: item.value as string, label: item.label as string, example: asString(item.example) }))
  if (choices.length > 0) result.choices = choices

  const cards = asArray(source.cards)
    .map(asObject)
    .filter((item): item is JsonObject => item !== null && typeof item.value === "string" && typeof item.label === "string")
    .map((item) => ({
      value: item.value as string,
      label: item.label as string,
      description: asString(item.description),
      example: asString(item.example),
    }))
  if (cards.length > 0) result.cards = cards

  const fields = asArray(source.fields)
    .map(asObject)
    .filter((item): item is JsonObject => item !== null && typeof item.key === "string" && typeof item.label === "string")
    .map((item) => ({ key: item.key as string, label: item.label as string, placeholder: asString(item.placeholder) }))
  if (fields.length > 0) result.fields = fields

  const extras = asArray(source.extras)
    .map(asObject)
    .filter(
      (item): item is JsonObject =>
        item !== null &&
        typeof item.key === "string" &&
        typeof item.label === "string" &&
        (EXTRA_KINDS as readonly unknown[]).includes(item.kind)
    )
    .map((item) => ({
      key: item.key as string,
      kind: item.kind as BriefingExtraKind,
      label: item.label as string,
      placeholder: asString(item.placeholder),
      required: item.required === true ? true : undefined,
    }))
  if (extras.length > 0) result.extras = extras

  if (typeof source.max === "number" && Number.isInteger(source.max) && source.max > 0) result.max = source.max
  if (source.primary === true) result.primary = true
  if (source.other === true) result.other = true
  if (source.voice === "essential") result.voice = "essential"
  if (source.unit === "BRL") result.unit = "BRL"
  const accept = asArray(source.accept).filter((item): item is string => typeof item === "string")
  if (accept.length > 0) result.accept = accept
  const placeholder = asString(source.placeholder)
  if (placeholder) result.placeholder = placeholder
  return result
}

/* ------------------------------------------------------------------ */
/* Dados da visão da equipe                                            */
/* ------------------------------------------------------------------ */

export interface TeamBriefingBlock {
  id: string
  position: number
  title: string
  description: string | null
  estimated_minutes: number | null
  active: boolean
}

export interface TeamBriefingQuestion {
  id: string
  block_id: string
  position: number
  key: string | null
  text: string
  hint: string | null
  kind: BriefingQuestionKind
  options: BriefingQuestionOptions
  required: boolean
  active: boolean
  created_at: Timestamp
}

/** Arquivo enviado numa resposta (bucket `briefing`). */
export interface BriefingFile {
  path: string
  name: string
  mime_type: string
  size_bytes: number
}

export interface TeamBriefingAudio {
  id: string
  path: string
  duration_ms: number
  created_at: Timestamp
  transcription: { status: BriefingAiStatus; transcript: string | null; error: string | null } | null
}

/** Cópia da pergunta guardada na resposta (`question_snapshot`). */
export interface QuestionSnapshot {
  text: string | null
  hint: string | null
  kind: BriefingQuestionKind | null
  options: BriefingQuestionOptions
  required: boolean | null
  block_title: string | null
}

export interface TeamBriefingAnswer {
  id: string
  question_id: string
  snapshot: QuestionSnapshot
  text: string | null
  value: unknown
  files: BriefingFile[]
  skipped: boolean
  updated_at: Timestamp
  audios: TeamBriefingAudio[]
  summary: { status: BriefingAiStatus; summary: string | null; error: string | null } | null
}

export interface TeamBriefingImmersion {
  meeting_id: string | null
  transcript: string
  notes: string
  updated_at: Timestamp
}

/** Tudo que a aba Briefing mostra de um briefing liberado. */
export interface TeamBriefingDetail {
  id: string
  status: BriefingStatus
  due_on: DateKey
  released_at: Timestamp
  started_at: Timestamp | null
  submitted_at: Timestamp | null
  immersion_at: Timestamp | null
  document_sent_at: Timestamp | null
  validated_at: Timestamp | null
  last_seen_at: Timestamp | null
  blocks: TeamBriefingBlock[]
  questions: TeamBriefingQuestion[]
  answers: TeamBriefingAnswer[]
  immersion: TeamBriefingImmersion | null
}

const KINDS: readonly BriefingQuestionKind[] = [
  "identification",
  "audio",
  "short_text",
  "number",
  "choice",
  "multiple",
  "cards",
  "palette",
  "upload",
  "links",
  "dates",
]

export function isQuestionKind(value: unknown): value is BriefingQuestionKind {
  return (KINDS as readonly unknown[]).includes(value)
}

export function parseSnapshot(value: unknown): QuestionSnapshot {
  const source = asObject(value) ?? {}
  return {
    text: asString(source.text) ?? null,
    hint: asString(source.hint) ?? null,
    kind: isQuestionKind(source.kind) ? source.kind : null,
    options: parseQuestionOptions(source.options),
    required: typeof source.required === "boolean" ? source.required : null,
    block_title: asString(source.block_title) ?? null,
  }
}

export function parseFiles(value: unknown): BriefingFile[] {
  return asArray(value)
    .map(asObject)
    .filter((item): item is JsonObject => item !== null && typeof item.path === "string")
    .map((item) => ({
      path: item.path as string,
      name: asString(item.name) || (item.path as string).split("/").pop() || "arquivo",
      mime_type: asString(item.mime_type) ?? "",
      size_bytes: typeof item.size_bytes === "number" ? item.size_bytes : 0,
    }))
}

/* ------------------------------------------------------------------ */
/* Respostas por bloco e o que falta                                   */
/* ------------------------------------------------------------------ */

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim() !== ""
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

/** Mesma regra do banco (`briefing_answer_filled`): tem conteúdo e não foi pulada. */
export function isAnswerFilled(answer: Pick<TeamBriefingAnswer, "skipped" | "text" | "value" | "files" | "audios">): boolean {
  if (answer.skipped) return false
  return (
    (answer.text ?? "").trim() !== "" || hasValue(answer.value) || answer.files.length > 0 || answer.audios.length > 0
  )
}

/**
 * A pergunta conta para este briefing? Ativa, num bloco ativo e, depois de
 * enviado, já existente no envio (pergunta criada depois não trava a imersão
 * nem aparece como faltando).
 */
export function questionCounts(
  question: Pick<TeamBriefingQuestion, "active" | "block_id" | "created_at">,
  activeBlocks: ReadonlySet<string>,
  submittedAt: Timestamp | null
): boolean {
  if (!question.active || !activeBlocks.has(question.block_id)) return false
  return submittedAt === null || question.created_at <= submittedAt
}

export interface BriefingItem {
  question: TeamBriefingQuestion
  answer: TeamBriefingAnswer | null
  /** Texto, dica, tipo e opções mostrados: a cópia da resposta, se houver. */
  text: string
  hint: string | null
  kind: BriefingQuestionKind
  options: BriefingQuestionOptions
  required: boolean
  filled: boolean
  /** A pergunta foi desativada depois de respondida. */
  retired: boolean
}

export interface BriefingSection {
  block: TeamBriefingBlock
  items: BriefingItem[]
  filled: number
  total: number
}

export interface BriefingProgress {
  answered: number
  total: number
  percent: number
  skipped: number
  /** Obrigatórias que ainda faltam, na ordem do formulário. */
  missing: { id: string; text: string; block: string }[]
}

export interface BriefingView {
  sections: BriefingSection[]
  progress: BriefingProgress
}

function byPosition<T extends { position: number }>(a: T, b: T) {
  return a.position - b.position
}

/** Monta as respostas por bloco, com as perguntas na ordem do formulário. */
export function buildBriefingView(detail: Pick<TeamBriefingDetail, "blocks" | "questions" | "answers" | "submitted_at">): BriefingView {
  const activeBlocks = new Set(detail.blocks.filter((block) => block.active).map((block) => block.id))
  const answerByQuestion = new Map(detail.answers.map((answer) => [answer.question_id, answer]))
  const sections: BriefingSection[] = []
  const progress: BriefingProgress = { answered: 0, total: 0, percent: 0, skipped: 0, missing: [] }

  for (const block of [...detail.blocks].sort(byPosition)) {
    const items: BriefingItem[] = []
    let filledCount = 0
    let totalCount = 0
    for (const question of detail.questions.filter((q) => q.block_id === block.id).sort(byPosition)) {
      const answer = answerByQuestion.get(question.id) ?? null
      const counts = questionCounts(question, activeBlocks, detail.submitted_at)
      if (!counts && !answer) continue
      const snapshot = answer?.snapshot
      const filled = answer ? isAnswerFilled(answer) : false
      const required = snapshot?.required ?? question.required
      items.push({
        question,
        answer,
        text: snapshot?.text ?? question.text,
        hint: snapshot?.text ? snapshot.hint : question.hint,
        kind: snapshot?.kind ?? question.kind,
        options: snapshot?.kind ? snapshot.options : question.options,
        required,
        filled,
        retired: !counts,
      })
      if (counts) {
        totalCount += 1
        if (filled) filledCount += 1
        if (answer?.skipped) progress.skipped += 1
        if (question.required && !filled) progress.missing.push({ id: question.id, text: question.text, block: block.title })
      }
    }
    if (items.length === 0) continue
    sections.push({ block, items, filled: filledCount, total: totalCount })
    progress.answered += filledCount
    progress.total += totalCount
  }

  progress.percent = progress.total === 0 ? 0 : Math.round((progress.answered / progress.total) * 100)
  return { sections, progress }
}

/* ------------------------------------------------------------------ */
/* Sequência de status (o que a equipe marca)                          */
/* ------------------------------------------------------------------ */

/** Depois do envio, a equipe avança: Imersão feita → Documento enviado → Validado. */
const TEAM_NEXT: Partial<Record<BriefingStatus, BriefingStatus>> = {
  submitted: "immersion_done",
  immersion_done: "document_sent",
  document_sent: "validated",
}

export function nextTeamStatus(status: BriefingStatus): BriefingStatus | null {
  return TEAM_NEXT[status] ?? null
}

/** Voltar um passo (marcou sem querer). Nunca reabre o briefing para o cliente. */
export function previousTeamStatus(status: BriefingStatus): BriefingStatus | null {
  const entry = Object.entries(TEAM_NEXT).find(([, next]) => next === status)
  return entry ? (entry[0] as BriefingStatus) : null
}

/** Coluna de data de cada status que a equipe marca. */
export const TEAM_STATUS_COLUMN = {
  immersion_done: "immersion_at",
  document_sent: "document_sent_at",
  validated: "validated_at",
} as const satisfies Partial<Record<BriefingStatus, string>>

export type TeamStatus = keyof typeof TEAM_STATUS_COLUMN

export function isTeamStatus(value: unknown): value is TeamStatus {
  return typeof value === "string" && value in TEAM_STATUS_COLUMN
}

export const TEAM_STATUS_ACTION: Record<TeamStatus, string> = {
  immersion_done: "Marcar imersão feita",
  document_sent: "Marcar documento enviado",
  validated: "Marcar como validado",
}

/**
 * Pode ir de `from` para `to`? Avançar um passo ou voltar um passo. A
 * imersão só com o briefing enviado e todos os obrigatórios respondidos.
 */
export function checkStatusChange(
  from: BriefingStatus,
  to: BriefingStatus,
  missingRequired: number
): { ok: true } | { ok: false; error: string } {
  if (isBriefingOpen(from)) return { ok: false, error: "O cliente ainda não enviou o briefing." }
  const forward = nextTeamStatus(from) === to
  const back = previousTeamStatus(from) === to
  if (!forward && !back) return { ok: false, error: "Esse passo não segue a sequência do briefing. Atualize a página." }
  if (forward && to === "immersion_done" && missingRequired > 0) {
    return {
      ok: false,
      error:
        missingRequired === 1
          ? "Falta 1 pergunta obrigatória. A imersão só pode ser marcada com todas respondidas."
          : `Faltam ${missingRequired} perguntas obrigatórias. A imersão só pode ser marcada com todas respondidas.`,
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Leitura das respostas                                               */
/* ------------------------------------------------------------------ */

/*
 * Leitura de `briefing_answers.value`. O formato é um só: `AnswerValue`, em
 * `flow-logic.ts` (quem grava é o portal). A leitura aqui é tolerante: o que
 * não se entende aparece como texto, nunca some.
 */

export type AnswerPart =
  | { type: "text"; label?: string; text: string }
  | { type: "chips"; label?: string; items: { label: string; primary?: boolean }[] }
  | { type: "tone"; items: { label: string; description?: string; example?: string; primary: boolean }[] }
  | { type: "colors"; label?: string; items: { hex: string; use: "use" | "avoid" | null }[] }
  | { type: "links"; label?: string; items: { text: string; href: string | null }[] }
  | { type: "dates"; label?: string; items: { date: DateKey | null; text: string }[] }
  | { type: "fields"; items: { label: string; text: string }[] }

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Link seguro para mostrar: só http(s); "@perfil" vira o Instagram. */
export function linkHref(raw: string): string | null {
  const text = raw.trim()
  if (/^@[A-Za-z0-9._]{1,30}$/.test(text)) return `https://www.instagram.com/${text.slice(1)}/`
  const candidate = /^https?:\/\//i.test(text) ? text : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? `https://${text}` : null
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUMBER = new Intl.NumberFormat("pt-BR")

function labelOf(options: BriefingQuestionOptions, value: string): string {
  return (
    options.choices?.find((choice) => choice.value === value)?.label ??
    options.cards?.find((card) => card.value === value)?.label ??
    (value === "other" ? "Outro" : value)
  )
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return null
}

function stringList(value: unknown): string[] {
  return asArray(value).map(textOf).filter((item): item is string => item !== null)
}

function colorsPart(value: unknown, label?: string): AnswerPart | null {
  const source = asObject(value)
  const list = Array.isArray(value) ? value : asArray(source?.colors)
  const items = list
    .map((item) => {
      if (typeof item === "string") return HEX.test(item) ? { hex: item, use: null } : null
      const color = asObject(item)
      const hex = asString(color?.hex)
      if (!hex || !HEX.test(hex)) return null
      const use = color?.use === "use" || color?.use === "avoid" ? color.use : null
      return { hex, use }
    })
    .filter((item): item is { hex: string; use: "use" | "avoid" | null } => item !== null)
  return items.length > 0 ? { type: "colors", label, items } : null
}

function linksPart(value: unknown, label?: string): AnswerPart | null {
  const source = asObject(value)
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : asArray(source?.links)
  const items = list
    .map((item) => textOf(item) ?? asString(asObject(item)?.url) ?? null)
    .filter((item): item is string => item !== null && item.trim() !== "")
    .map((text) => ({ text, href: linkHref(text) }))
  return items.length > 0 ? { type: "links", label, items } : null
}

function datesPart(value: unknown, label?: string): AnswerPart | null {
  const source = asObject(value)
  const list = Array.isArray(value) ? value : asArray(source?.dates)
  const items = list
    .map((item) => {
      const entry = asObject(item)
      if (!entry) {
        const text = textOf(item)
        return text ? { date: isDateKey(text) ? text : null, text: isDateKey(text) ? "" : text } : null
      }
      const date = isDateKey(entry.date) ? entry.date : null
      const text = asString(entry.label) ?? asString(entry.text) ?? ""
      return date || text ? { date, text } : null
    })
    .filter((item): item is { date: DateKey | null; text: string } => item !== null)
  return items.length > 0 ? { type: "dates", label, items } : null
}

/** Qualquer coisa que sobrou, legível (chave: valor). */
function fallbackParts(value: unknown, label?: string): AnswerPart[] {
  const text = textOf(value)
  if (text) return [{ type: "text", label, text }]
  if (Array.isArray(value)) {
    const items = stringList(value)
    return items.length > 0 ? [{ type: "chips", label, items: items.map((item) => ({ label: item })) }] : []
  }
  const source = asObject(value)
  if (!source) return []
  const items = Object.entries(source)
    .map(([key, entry]) => ({ label: key, text: textOf(entry) ?? (stringList(entry).join(", ") || "") }))
    .filter((item) => item.text !== "")
  return items.length > 0 ? [{ type: "fields", items }] : []
}

function extrasParts(options: BriefingQuestionOptions, extras: unknown): AnswerPart[] {
  const source = asObject(extras)
  if (!source) return []
  const parts: AnswerPart[] = []
  const known = new Set<string>()
  for (const extra of options.extras ?? []) {
    known.add(extra.key)
    const entry = source[extra.key]
    if (!hasValue(entry)) continue
    const part =
      extra.kind === "palette"
        ? colorsPart(entry, extra.label)
        : extra.kind === "links"
          ? linksPart(entry, extra.label)
          : textOf(entry)
            ? ({ type: "text", label: extra.label, text: textOf(entry)! } as AnswerPart)
            : null
    if (part) parts.push(part)
    else parts.push(...fallbackParts(entry, extra.label))
  }
  for (const [key, entry] of Object.entries(source)) {
    if (!known.has(key) && hasValue(entry)) parts.push(...fallbackParts(entry, key))
  }
  return parts
}

/**
 * Partes legíveis de uma resposta (sem os áudios e os arquivos, que a tela
 * mostra à parte). `text` é a resposta escrita.
 */
export function describeAnswer(
  kind: BriefingQuestionKind,
  options: BriefingQuestionOptions,
  value: unknown,
  text: string | null
): AnswerPart[] {
  const parts: AnswerPart[] = []
  const written = (text ?? "").trim()
  const source = asObject(value)
  const handled = new Set<string>(["extras", "other"])

  switch (kind) {
    case "choice": {
      const choice = textOf(source?.choice) ?? (typeof value === "string" ? value : null)
      handled.add("choice")
      const other = textOf(source?.other)
      if (choice || other) {
        const label = choice && choice !== "other" ? labelOf(options, choice) : other ? `Outro: ${other}` : "Outro"
        const items = [{ label }]
        if (choice && choice !== "other" && other) items.push({ label: `Outro: ${other}` })
        parts.push({ type: "chips", items })
      }
      break
    }
    case "multiple": {
      const values = Array.isArray(value) ? stringList(value) : stringList(source?.choices)
      handled.add("choices")
      const other = textOf(source?.other)
      const items = values.filter((item) => item !== "other" || !other).map((item) => ({ label: labelOf(options, item) }))
      if (other) items.push({ label: `Outro: ${other}` })
      if (items.length > 0) parts.push({ type: "chips", items })
      break
    }
    case "cards": {
      const values = Array.isArray(value) ? stringList(value) : stringList(source?.choices)
      handled.add("choices")
      handled.add("primary")
      const primary = textOf(source?.primary) ?? (values.length === 1 ? values[0] : null)
      const items = values.map((item) => {
        const card = options.cards?.find((entry) => entry.value === item)
        return {
          label: card?.label ?? item,
          description: card?.description,
          example: card?.example,
          primary: item === primary,
        }
      })
      items.sort((a, b) => Number(b.primary) - Number(a.primary))
      if (items.length > 0) parts.push({ type: "tone", items })
      // Os que o cliente marcou "assim não" (opcional).
      const rejected = stringList(source?.rejected)
      handled.add("rejected")
      if (rejected.length > 0) {
        parts.push({ type: "chips", label: "Assim não", items: rejected.map((item) => ({ label: labelOf(options, item) })) })
      }
      break
    }
    case "number": {
      const raw = typeof value === "number" ? value : typeof source?.number === "number" ? source.number : Number(textOf(source?.number) ?? NaN)
      handled.add("number")
      if (Number.isFinite(raw)) parts.push({ type: "text", text: options.unit === "BRL" ? BRL.format(raw) : NUMBER.format(raw) })
      break
    }
    case "palette": {
      const part = colorsPart(value)
      handled.add("colors")
      if (part) parts.push(part)
      break
    }
    case "links": {
      const part = linksPart(value)
      handled.add("links")
      if (part) parts.push(part)
      break
    }
    case "dates": {
      const part = datesPart(value)
      handled.add("dates")
      if (part) parts.push(part)
      break
    }
    case "identification": {
      const fields = options.fields ?? []
      const items = fields
        .map((field) => ({ label: field.label, text: textOf(source?.[field.key]) ?? "" }))
        .filter((item) => item.text !== "")
      for (const field of fields) handled.add(field.key)
      if (items.length > 0) parts.push({ type: "fields", items })
      break
    }
    case "short_text":
    case "audio":
    case "upload": {
      const fields = options.fields ?? []
      const values = asObject(source?.fields) ?? (fields.length > 0 ? source : null)
      handled.add("fields")
      if (fields.length > 0 && values) {
        const items = fields
          .map((field) => ({ label: field.label, text: textOf(values[field.key]) ?? "" }))
          .filter((item) => item.text !== "")
        for (const field of fields) handled.add(field.key)
        if (items.length > 0) parts.push({ type: "fields", items })
      }
      break
    }
  }

  if (written) parts.unshift({ type: "text", text: written })

  if (source) {
    parts.push(...extrasParts(options, source.extras))
    const rest = Object.fromEntries(Object.entries(source).filter(([key, entry]) => !handled.has(key) && hasValue(entry)))
    if (Object.keys(rest).length > 0) parts.push(...fallbackParts(rest))
  } else if (value !== null && value !== undefined && !["choice", "multiple", "cards", "number", "palette", "links", "dates"].includes(kind)) {
    parts.push(...fallbackParts(value))
  }
  return parts
}

/** "1:42" a partir de milissegundos. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

/**
 * URL do app para um arquivo enviado no briefing (rota do portal, PR 2:
 * confere a sessão e redireciona para a URL assinada; a equipe lê tudo pelo
 * RLS do Storage). `download` baixa com o nome original.
 */
export function briefingFileUrl(path: string, download?: string): string {
  const url = `/api/briefing/arquivos?caminho=${encodeURIComponent(path)}`
  return download ? `${url}&baixar=1&nome=${encodeURIComponent(download)}` : url
}

/** URL do app para um áudio do briefing, pelo id (rota do portal, PR 2). */
export function briefingAudioUrl(id: string): string {
  return `/api/briefing/audios/${encodeURIComponent(id)}`
}

/* ------------------------------------------------------------------ */
/* Reuniões para ligar à imersão                                       */
/* ------------------------------------------------------------------ */

export interface ImmersionMeetingOption {
  /** `${eventId}:${date}` */
  key: string
  eventId: string
  date: DateKey
  title: string
  /** "14:00"; `null` em evento de dia inteiro. */
  time: string | null
  /** Registro da reunião, se já existe (o link abre a página dela). */
  meetingId: string | null
}

/**
 * Reuniões do cliente no calendário do Admin (próximas e recentes), e a que
 * já está ligada à imersão mesmo que tenha ficado fora da janela.
 */
export function immersionMeetingOptions(
  clientId: string,
  events: CalendarEvent[],
  records: MeetingRecord[],
  today: DateKey,
  linkedMeetingId: string | null
): ImmersionMeetingOption[] {
  const clientEvents = events.filter((event) => event.client_id === clientId)
  const overview = meetingsOverview(clientEvents, records, today, { horizonDays: 60, lookbackDays: 90 })
  const entries = [...overview.upcoming, ...overview.history]
  const options = entries.map((entry) => ({
    key: entry.key,
    eventId: entry.event.id,
    date: entry.date,
    title: entry.event.title,
    time: entry.startTime,
    meetingId: entry.record?.id ?? null,
  }))
  if (linkedMeetingId && !options.some((option) => option.meetingId === linkedMeetingId)) {
    const record = records.find((item) => item.id === linkedMeetingId)
    const event = record ? clientEvents.find((item) => item.id === record.event_id) : undefined
    if (record && event) {
      const entry = meetingEntry(event, recordDate(record, event), record)
      options.push({ key: entry.key, eventId: event.id, date: entry.date, title: event.title, time: entry.startTime, meetingId: record.id })
    }
  }
  return options.sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : b.date.localeCompare(a.date)))
}
