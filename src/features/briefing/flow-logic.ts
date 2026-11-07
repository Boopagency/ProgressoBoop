import type { BriefingStatus, DateKey, Timestamp } from "@/lib/types"

/*
 * Regras do fluxo do briefing no portal (uma pergunta por tela): o formato
 * das opções e das respostas, quando uma resposta está completa, a ordem das
 * telas, onde retomar e o que o card "Sua marca" mostra. Funções puras; o
 * banco confere de novo os obrigatórios ao fechar etapa e ao enviar.
 */

/** Até 3 minutos por áudio no briefing (o banco aceita uma folga). */
export const BRIEFING_AUDIO_MAX_MS = 3 * 60 * 1000
/** Até 50 MB por arquivo (o limite do bucket `briefing`). */
export const BRIEFING_FILE_MAX_BYTES = 50 * 1024 * 1024
/** Tipos que o bucket aceita para os uploads (logo, manual, fotos, vídeos, fontes). */
export const BRIEFING_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/zip",
  "application/x-zip-compressed",
] as const

export function isBriefingFileType(type: string): boolean {
  return (BRIEFING_FILE_TYPES as readonly string[]).includes(type)
}

export type QuestionKind =
  | "identification"
  | "audio"
  | "short_text"
  | "number"
  | "choice"
  | "multiple"
  | "cards"
  | "palette"
  | "upload"
  | "links"
  | "dates"

export type ExtraKind = "short_text" | "audio" | "links" | "palette"

export interface ChoiceOption {
  value: string
  label: string
  example?: string
}

export interface ToneCard {
  value: string
  label: string
  description?: string
  example: string
}

export interface FieldOption {
  key: string
  label: string
  placeholder?: string
}

export interface ExtraOption {
  key: string
  kind: ExtraKind
  label: string
  placeholder?: string
  required?: boolean
}

/** `options` da pergunta, já lidas (o formato está comentado na migration). */
export interface QuestionOptions {
  choices: ChoiceOption[]
  cards: ToneCard[]
  fields: FieldOption[]
  extras: ExtraOption[]
  max: number | null
  primary: boolean
  other: boolean
  voice: "essential" | null
  unit: "BRL" | null
  accept: string[]
  placeholder: string | null
}

export interface FlowQuestion {
  id: string
  key: string | null
  text: string
  hint: string | null
  kind: QuestionKind
  options: QuestionOptions
  required: boolean
}

export interface FlowBlock {
  id: string
  title: string
  description: string | null
  estimated_minutes: number | null
  questions: FlowQuestion[]
}

export interface BriefingFile {
  path: string
  name: string
  mime_type: string
  size_bytes: number
}

export interface BriefingAudio {
  id: string
  duration_ms: number
  created_at: Timestamp
}

/** Uma cor da paleta: `#rrggbb` (minúsculo), para usar ou para evitar. */
export interface ColorPick {
  hex: string
  use: "use" | "avoid"
}

/** A paleta como a tela edita (as duas listas); no banco vira `colors`. */
export interface PaletteValue {
  use: string[]
  avoid: string[]
}

/**
 * Complemento de uma pergunta (`extras.<key>`): texto (texto curto e o
 * texto alternativo do áudio), `{ links }` ou `{ colors }`.
 */
export type ExtraValue = string | { links: string[] } | { colors: ColorPick[] }

export const IDENTIFICATION_KEYS = ["brand_name", "contact_name", "region", "instagram", "site"] as const
export type IdentificationKey = (typeof IDENTIFICATION_KEYS)[number]

/**
 * Resposta estruturada (`briefing_answers.value`), no formato combinado com a
 * visão da equipe (Parte 2), por tipo de pergunta:
 *   choice   { choice, other?, extras? }
 *   multiple { choices, other?, extras? }
 *   cards    { choices, primary?, rejected?, extras? }   (rejected: "assim não")
 *   number   { number }
 *   palette  { colors: [{ hex, use }] }
 *   links    { links, extras? }
 *   dates    { dates: [{ date, label }], extras? }
 *   identification { brand_name, contact_name, region, instagram, site }
 *   short_text com campos { fields: { use, avoid } } (sem campos, só `text`)
 *   upload   arquivos em `files`, { extras? }
 */
export interface AnswerValue extends Partial<Record<IdentificationKey, string>> {
  choice?: string
  choices?: string[]
  /** Texto do "Outro". */
  other?: string
  primary?: string
  rejected?: string[]
  number?: number
  fields?: Record<string, string>
  links?: string[]
  dates?: { date: DateKey; label: string }[]
  colors?: ColorPick[]
  extras?: Record<string, ExtraValue>
}

/** `colors` → as duas listas da tela. */
export function paletteOf(colors: readonly ColorPick[] | undefined): PaletteValue {
  return {
    use: (colors ?? []).filter((item) => item.use === "use").map((item) => item.hex),
    avoid: (colors ?? []).filter((item) => item.use === "avoid").map((item) => item.hex),
  }
}

/** As duas listas da tela → `colors` (sem repetir; a mesma cor não fica nas duas). */
export function colorsOf(palette: PaletteValue): ColorPick[] {
  const seen = new Set<string>()
  const picks: ColorPick[] = []
  for (const use of ["use", "avoid"] as const) {
    for (const raw of palette[use]) {
      const hex = raw.toLowerCase()
      if (!isHexColor(hex) || seen.has(hex)) continue
      seen.add(hex)
      picks.push({ hex, use })
    }
  }
  return picks
}

export interface FlowAnswer {
  text: string
  value: AnswerValue
  files: BriefingFile[]
  skipped: boolean
  audios: BriefingAudio[]
}

export const EMPTY_ANSWER: FlowAnswer = { text: "", value: {}, files: [], skipped: false, audios: [] }

/** O que a tela do fluxo recebe do servidor. */
export interface FlowData {
  briefingId: string
  clientId: string
  status: BriefingStatus
  dueOn: DateKey
  currentQuestionId: string | null
  completedBlockIds: string[]
  identification: Record<string, string>
  blocks: FlowBlock[]
  answers: Record<string, FlowAnswer>
}

// Leitura das opções ---------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const EXTRA_KINDS: readonly ExtraKind[] = ["short_text", "audio", "links", "palette"]

export function parseOptions(raw: unknown): QuestionOptions {
  const source = asRecord(raw)
  const choices = asArray(source.choices).flatMap((item) => {
    const row = asRecord(item)
    const value = asString(row.value)
    const label = asString(row.label)
    return value && label ? [{ value, label, ...(asString(row.example) ? { example: asString(row.example) } : {}) }] : []
  })
  const cards = asArray(source.cards).flatMap((item) => {
    const row = asRecord(item)
    const value = asString(row.value)
    const label = asString(row.label)
    const example = asString(row.example)
    return value && label && example ? [{ value, label, example, description: asString(row.description) }] : []
  })
  const fields = asArray(source.fields).flatMap((item) => {
    const row = asRecord(item)
    const key = asString(row.key)
    const label = asString(row.label)
    return key && label ? [{ key, label, placeholder: asString(row.placeholder) }] : []
  })
  const extras = asArray(source.extras).flatMap((item) => {
    const row = asRecord(item)
    const key = asString(row.key)
    const label = asString(row.label)
    const kind = asString(row.kind) as ExtraKind | undefined
    return key && label && kind && EXTRA_KINDS.includes(kind)
      ? [{ key, kind, label, placeholder: asString(row.placeholder), required: row.required === true }]
      : []
  })
  const max = typeof source.max === "number" && source.max > 0 ? Math.floor(source.max) : null
  return {
    choices,
    cards,
    fields,
    extras,
    max,
    primary: source.primary === true,
    other: source.other === true,
    voice: source.voice === "essential" ? "essential" : null,
    unit: source.unit === "BRL" ? "BRL" : null,
    accept: asArray(source.accept).filter((item): item is string => typeof item === "string"),
    placeholder: asString(source.placeholder) ?? null,
  }
}

/** Lê o jsonb `value` de uma resposta (o que não tiver o formato certo fica de fora). */
export function parseAnswerValue(raw: unknown): AnswerValue {
  const source = asRecord(raw)
  const value: AnswerValue = {}
  const strings = (input: unknown) => asArray(input).filter((item): item is string => typeof item === "string")
  if (asString(source.choice)) value.choice = asString(source.choice)
  if (Array.isArray(source.choices)) value.choices = strings(source.choices)
  if (asString(source.other)) value.other = asString(source.other)
  if (asString(source.primary)) value.primary = asString(source.primary)
  if (Array.isArray(source.rejected)) value.rejected = strings(source.rejected)
  for (const key of IDENTIFICATION_KEYS) {
    if (typeof source[key] === "string") value[key] = source[key]
  }
  if (typeof source.number === "number" && Number.isFinite(source.number)) value.number = source.number
  if (source.fields) {
    value.fields = Object.fromEntries(Object.entries(asRecord(source.fields)).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  }
  if (Array.isArray(source.links)) value.links = strings(source.links)
  if (Array.isArray(source.dates)) {
    value.dates = source.dates.flatMap((item) => {
      const row = asRecord(item)
      const date = asString(row.date)
      return date ? [{ date, label: asString(row.label) ?? "" }] : []
    })
  }
  if (Array.isArray(source.colors)) value.colors = parseColors(source.colors)
  if (source.extras) {
    const extras: Record<string, ExtraValue> = {}
    for (const [key, raw] of Object.entries(asRecord(source.extras))) {
      const item = asRecord(raw)
      if (typeof raw === "string") extras[key] = raw
      else if (Array.isArray(item.links)) extras[key] = { links: strings(item.links) }
      else if (Array.isArray(item.colors)) extras[key] = { colors: parseColors(item.colors) }
    }
    value.extras = extras
  }
  return value
}

function parseColors(raw: unknown[]): ColorPick[] {
  return raw.flatMap((item) => {
    const row = asRecord(item)
    const hex = asString(row.hex)?.toLowerCase()
    const use = row.use === "avoid" ? "avoid" : row.use === "use" ? "use" : null
    return hex && isHexColor(hex) && use ? [{ hex, use }] : []
  })
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function parseFiles(raw: unknown): BriefingFile[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item)
    const path = asString(row.path)
    if (!path) return []
    return [
      {
        path,
        name: asString(row.name) ?? "arquivo",
        mime_type: asString(row.mime_type) ?? "",
        size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : 0,
      },
    ]
  })
}

// Normalização e completude ----------------------------------------------------

const clean = (text: string | undefined) => (text ?? "").replace(/[ \t]+/g, " ").trim()

function cleanColors(colors: readonly ColorPick[] | undefined): ColorPick[] | undefined {
  const picks = colorsOf(paletteOf(colors))
  return picks.length ? picks : undefined
}

function cleanList(list: string[] | undefined): string[] | undefined {
  const items = (list ?? []).map((item) => clean(item)).filter(Boolean)
  return items.length ? items : undefined
}

/**
 * Tira o que está vazio (texto em branco, lista vazia, "Outro" sem escolha).
 * Sem nada, devolve null: o banco não conta a resposta como respondida.
 */
export function normalizeValue(value: AnswerValue): AnswerValue | null {
  const result: AnswerValue = {}
  if (value.choice) result.choice = value.choice
  const choices = [...new Set(value.choices ?? [])]
  if (choices.length) result.choices = choices
  const pickedOther = value.choice === "other" || choices.includes("other")
  if (pickedOther && clean(value.other)) result.other = clean(value.other)
  if (value.primary && choices.includes(value.primary)) result.primary = value.primary
  const rejected = [...new Set(value.rejected ?? [])].filter((item) => !choices.includes(item))
  if (rejected.length) result.rejected = rejected
  for (const key of IDENTIFICATION_KEYS) {
    const text = clean(value[key])
    if (text) result[key] = text
  }
  if (typeof value.number === "number" && Number.isFinite(value.number) && value.number >= 0) result.number = value.number
  if (value.fields) {
    const fields = Object.fromEntries(Object.entries(value.fields).map(([key, text]) => [key, clean(text)]).filter((entry) => entry[1]))
    if (Object.keys(fields).length) result.fields = fields
  }
  const links = cleanList(value.links)
  if (links) result.links = links
  const dates = (value.dates ?? []).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date)).map((item) => ({ date: item.date, label: clean(item.label) }))
  if (dates.length) result.dates = dates
  const colors = cleanColors(value.colors)
  if (colors) result.colors = colors
  if (value.extras) {
    const extras: Record<string, ExtraValue> = {}
    for (const [key, item] of Object.entries(value.extras)) {
      if (typeof item === "string") {
        if (clean(item)) extras[key] = clean(item)
      } else if ("links" in item) {
        const list = cleanList(item.links)
        if (list) extras[key] = { links: list }
      } else {
        const picks = cleanColors(item.colors)
        if (picks) extras[key] = { colors: picks }
      }
    }
    if (Object.keys(extras).length) result.extras = extras
  }
  return Object.keys(result).length ? result : null
}

function extraFilled(value: ExtraValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === "string") return clean(value) !== ""
  if ("links" in value) return value.links.some((item) => clean(item) !== "")
  return value.colors.length > 0
}

/** O principal da pergunta está respondido (sem contar os complementos opcionais). */
function mainFilled(question: FlowQuestion, answer: FlowAnswer): boolean {
  const value = answer.value
  const { options } = question
  switch (question.kind) {
    case "identification":
      return clean(value.brand_name) !== ""
    case "audio":
      return clean(answer.text) !== "" || answer.audios.length > 0
    case "short_text":
      return options.fields.length > 0
        ? options.fields.some((field) => clean(value.fields?.[field.key]) !== "")
        : clean(answer.text) !== ""
    case "number":
      return typeof value.number === "number" && Number.isFinite(value.number) && value.number >= 0
    case "choice":
      if (!value.choice) return false
      return value.choice !== "other" || clean(value.other) !== ""
    case "multiple": {
      const choices = value.choices ?? []
      if (choices.length === 0 || (options.max !== null && choices.length > options.max)) return false
      return !choices.includes("other") || clean(value.other) !== ""
    }
    case "cards": {
      const yes = value.choices ?? []
      if (yes.length === 0 || (options.max !== null && yes.length > options.max)) return false
      return !(options.primary && yes.length > 1 && !value.primary)
    }
    case "palette":
      return (value.colors ?? []).length > 0
    case "upload":
      return answer.files.length > 0 || question.options.extras.some((extra) => extraFilled(value.extras?.[extra.key]))
    case "links":
      return (value.links ?? []).some((link) => clean(link) !== "")
    case "dates":
      return (value.dates ?? []).length > 0 || question.options.extras.some((extra) => extraFilled(value.extras?.[extra.key]))
  }
}

/** A resposta está completa: o principal e os complementos obrigatórios (ex.: o nome de quem aprova). */
export function isAnswerComplete(question: FlowQuestion, answer: FlowAnswer | undefined): boolean {
  if (!answer || answer.skipped) return false
  if (!mainFilled(question, answer)) return false
  return question.options.extras.every((extra) => !extra.required || extraFilled(answer.value.extras?.[extra.key]))
}

/** Tem alguma coisa escrita, escolhida, gravada ou enviada (mesmo incompleta). */
export function hasAnyContent(answer: FlowAnswer | undefined): boolean {
  if (!answer) return false
  return clean(answer.text) !== "" || normalizeValue(answer.value) !== null || answer.files.length > 0 || answer.audios.length > 0
}

// Telas e retomada ---------------------------------------------------------------

export type FlowStep =
  | { type: "intro" }
  | { type: "question"; blockIndex: number; questionIndex: number; question: FlowQuestion }
  | { type: "block_done"; blockIndex: number }
  | { type: "review" }

/** A ordem das telas: boas-vindas, as perguntas de cada etapa com o fechamento dela, e a revisão para enviar. */
export function buildSteps(blocks: readonly FlowBlock[]): FlowStep[] {
  const steps: FlowStep[] = [{ type: "intro" }]
  blocks.forEach((block, blockIndex) => {
    if (block.questions.length === 0) return
    block.questions.forEach((question, questionIndex) => steps.push({ type: "question", blockIndex, questionIndex, question }))
    steps.push({ type: "block_done", blockIndex })
  })
  steps.push({ type: "review" })
  return steps
}

/** Onde retomar: a pergunta em que parou; sem ela, a boas-vindas. */
export function resumeIndex(steps: readonly FlowStep[], currentQuestionId: string | null): number {
  if (!currentQuestionId) return 0
  const index = steps.findIndex((step) => step.type === "question" && step.question.id === currentQuestionId)
  return index >= 0 ? index : 0
}

/** Obrigatórias sem resposta completa, na ordem do formulário. */
export function missingRequired(blocks: readonly FlowBlock[], answers: Record<string, FlowAnswer>, blockId?: string): FlowQuestion[] {
  return blocks
    .filter((block) => !blockId || block.id === blockId)
    .flatMap((block) => block.questions.filter((question) => question.required && !isAnswerComplete(question, answers[question.id])))
}

/** Opcionais puladas ("pular por agora"): ficam marcadas para a reunião. */
export function skippedQuestions(blocks: readonly FlowBlock[], answers: Record<string, FlowAnswer>): FlowQuestion[] {
  return blocks.flatMap((block) => block.questions.filter((question) => answers[question.id]?.skipped))
}

/** Minutos que faltam: as etapas ainda não fechadas. */
export function remainingMinutes(blocks: readonly FlowBlock[], completed: readonly string[]): number {
  return blocks.filter((block) => !completed.includes(block.id)).reduce((total, block) => total + (block.estimated_minutes ?? 0), 0)
}

/** Fração das perguntas com resposta completa (para a barra de progresso). */
export function progressFraction(blocks: readonly FlowBlock[], answers: Record<string, FlowAnswer>): number {
  const questions = blocks.flatMap((block) => block.questions)
  if (questions.length === 0) return 0
  const done = questions.filter((question) => isAnswerComplete(question, answers[question.id])).length
  return done / questions.length
}

// "Sua marca" ----------------------------------------------------------------------

export interface BrandCard {
  name: string | null
  region: string | null
  instagram: string | null
  since: string | null
  channel: string | null
  price: string | null
  tones: string[]
  colors: string[]
  references: number
  materials: number
}

function findQuestion(blocks: readonly FlowBlock[], key: string): FlowQuestion | undefined {
  for (const block of blocks) {
    const found = block.questions.find((question) => question.key === key)
    if (found) return found
  }
  return undefined
}

function choiceLabel(question: FlowQuestion | undefined, answer: FlowAnswer | undefined): string | null {
  if (!question || !answer || answer.skipped) return null
  const value = answer.value.choice
  if (!value) return null
  if (value === "other") return clean(answer.value.other) || null
  return question.options.choices.find((choice) => choice.value === value)?.label ?? null
}

/**
 * O card "Sua marca": só o que o cliente escolheu ou enviou (respostas
 * fechadas e uploads), nada escrito pela IA. Pelas `key` das perguntas do v1.
 */
export function buildBrandCard(data: Pick<FlowData, "blocks" | "answers" | "identification">): BrandCard {
  const { blocks, answers } = data
  const answerOf = (key: string) => {
    const question = findQuestion(blocks, key)
    return { question, answer: question ? answers[question.id] : undefined }
  }
  const identification = answerOf("identification").answer?.value ?? {}
  const field = (key: IdentificationKey) => clean(identification[key] ?? data.identification[key]) || null

  const age = answerOf("brand_age")
  const channel = answerOf("sales_channel")
  const price = answerOf("price_position")
  const tone = answerOf("brand_tone")
  const yes = tone.answer && !tone.answer.skipped ? (tone.answer.value.choices ?? []) : []
  const primary = tone.answer?.value.primary
  const ordered = primary ? [primary, ...yes.filter((item) => item !== primary)] : yes
  const tones = ordered.flatMap((value) => {
    const label = tone.question?.options.cards.find((card) => card.value === value)?.label
    return label ? [label] : []
  })

  const colors: string[] = []
  const references = { count: 0 }
  let materials = 0
  for (const block of blocks) {
    for (const question of block.questions) {
      const answer = answers[question.id]
      if (!answer || answer.skipped) continue
      if (question.kind === "upload") materials += answer.files.length
      if (question.kind === "links") references.count += (answer.value.links ?? []).length
      const picks = [...(answer.value.colors ?? [])]
      for (const extra of Object.values(answer.value.extras ?? {})) {
        if (typeof extra === "object" && "colors" in extra) picks.push(...extra.colors)
      }
      colors.push(...picks.filter((pick) => pick.use === "use").map((pick) => pick.hex))
    }
  }

  return {
    name: field("brand_name"),
    region: field("region"),
    instagram: field("instagram"),
    since: choiceLabel(age.question, age.answer),
    channel: choiceLabel(channel.question, channel.answer),
    price: choiceLabel(price.question, price.answer),
    tones,
    colors: [...new Set(colors)].slice(0, 8),
    references: references.count,
    materials,
  }
}

/** Valor em reais digitado ("1.234,56", "180") → número; inválido, null. */
export function parseBrl(text: string): number | null {
  const digits = text.replace(/[^\d,.]/g, "")
  if (!digits) return null
  const normalized = digits.includes(",") ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/\.(?=\d{3}(\D|$))/g, "")
  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
}

/** Endereço estável do áudio de uma resposta (a rota confere a sessão e redireciona). */
export function briefingAudioSrc(audioId: string): string {
  return `/api/briefing/audios/${audioId}`
}

/** Endereço de um arquivo enviado no briefing. */
export function briefingFileSrc(path: string): string {
  return `/api/briefing/arquivos?caminho=${encodeURIComponent(path)}`
}
