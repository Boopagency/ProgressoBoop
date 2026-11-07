import {
  EXTRA_KINDS,
  isQuestionKind,
  type BriefingToneCard,
  type BriefingChoice,
  type BriefingExtra,
  type BriefingField,
  type BriefingQuestionKind,
  type BriefingQuestionOptions,
} from "@/features/briefing/team-logic"

/*
 * Editor de perguntas do briefing (issue #108, Parte 2). Regras puras: o que
 * cada tipo aceita nas opções e a validação do que a equipe digitou. Blocos e
 * perguntas nunca são apagados, só desativados; a resposta guarda a cópia da
 * pergunta, então editar não muda o que já foi respondido e enviado.
 */

export const QUESTION_KIND_LABEL: Record<BriefingQuestionKind, string> = {
  identification: "Identificação",
  audio: "Aberta (áudio ou texto)",
  short_text: "Texto curto",
  number: "Número",
  choice: "Escolha única",
  multiple: "Várias escolhas",
  cards: "Cards (tom de voz)",
  palette: "Paleta de cores",
  upload: "Arquivos",
  links: "Links",
  dates: "Datas",
}

/** Tipos que o editor oferece. A identificação (bloco 0) é fixa: os campos vão para o briefing. */
export const EDITABLE_KINDS: readonly BriefingQuestionKind[] = [
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

export const EXTRA_KIND_LABEL: Record<BriefingExtra["kind"], string> = {
  short_text: "Texto curto",
  audio: "Áudio ou texto",
  palette: "Paleta de cores",
  links: "Links",
}

/** Grupos de arquivos que uma pergunta de upload aceita. */
export const UPLOAD_ACCEPT_OPTIONS = [
  { value: "image/*", label: "Imagens" },
  { value: "application/pdf", label: "PDF" },
  { value: "video/*", label: "Vídeos" },
  { value: "font/*", label: "Fontes" },
  { value: "application/zip", label: "ZIP" },
] as const

/** Que partes das opções cada tipo usa (o editor mostra só essas). */
export function optionFeatures(kind: BriefingQuestionKind) {
  return {
    choices: kind === "choice" || kind === "multiple",
    cards: kind === "cards",
    max: kind === "multiple" || kind === "cards" || kind === "links",
    primary: kind === "cards",
    other: kind === "choice" || kind === "multiple",
    voice: kind === "audio",
    unit: kind === "number",
    accept: kind === "upload",
    fields: kind === "short_text",
    placeholder: kind === "short_text" || kind === "number" || kind === "links",
    extras: kind !== "identification",
  }
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

/** Texto em várias linhas (dicas e exemplos podem ter quebra). */
function cleanMultiline(value: unknown): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : ""
}

/** "Indicação de clientes" → "indicacao_de_clientes". */
export function slugify(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return /^[a-z]/.test(slug) ? slug : `opcao_${slug || "nova"}`.slice(0, 40)
}

/** Valor estável para uma opção nova, sem repetir os que já existem. */
export function uniqueValue(label: string, taken: ReadonlySet<string>): string {
  const base = slugify(label)
  if (!taken.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base.slice(0, 36)}_${index}`
    if (!taken.has(candidate)) return candidate
  }
}

export interface BlockInput {
  title: string
  description: string
  estimated_minutes: number | null
}

export function validateBlockInput(input: unknown): Result<{ title: string; description: string | null; estimated_minutes: number | null }> {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const title = clean(source.title)
  if (!title) return { ok: false, error: "Dê um título ao bloco." }
  if (title.length > 120) return { ok: false, error: "Título do bloco: até 120 caracteres." }
  const description = cleanMultiline(source.description)
  if (description.length > 500) return { ok: false, error: "Descrição do bloco: até 500 caracteres." }
  const minutes = source.estimated_minutes
  if (minutes !== null && minutes !== undefined && minutes !== "") {
    const value = Number(minutes)
    if (!Number.isInteger(value) || value < 1 || value > 60) return { ok: false, error: "Tempo do bloco: de 1 a 60 minutos." }
    return { ok: true, data: { title, description: description || null, estimated_minutes: value } }
  }
  return { ok: true, data: { title, description: description || null, estimated_minutes: null } }
}

export interface QuestionInput {
  block_id: string
  text: string
  hint: string
  kind: BriefingQuestionKind
  required: boolean
  options: BriefingQuestionOptions
}

function validateChoices(list: unknown, what: string): Result<BriefingChoice[]> {
  const items = Array.isArray(list) ? list : []
  const taken = new Set<string>()
  const result: BriefingChoice[] = []
  for (const raw of items) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const label = clean(item.label)
    if (!label) continue
    if (label.length > 120) return { ok: false, error: `${what}: até 120 caracteres cada.` }
    const example = cleanMultiline(item.example)
    if (example.length > 300) return { ok: false, error: `Exemplo de ${what.toLowerCase()}: até 300 caracteres.` }
    let value = clean(item.value)
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(value) || taken.has(value)) value = uniqueValue(label, taken)
    taken.add(value)
    result.push(example ? { value, label, example } : { value, label })
  }
  return { ok: true, data: result }
}

function validateCards(list: unknown): Result<BriefingToneCard[]> {
  const items = Array.isArray(list) ? list : []
  const taken = new Set<string>()
  const result: BriefingToneCard[] = []
  for (const raw of items) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const label = clean(item.label)
    if (!label) continue
    if (label.length > 120) return { ok: false, error: "Nome do card: até 120 caracteres." }
    const description = cleanMultiline(item.description)
    const example = cleanMultiline(item.example)
    if (description.length > 300 || example.length > 500) {
      return { ok: false, error: "Card: descrição até 300 e exemplo até 500 caracteres." }
    }
    let value = clean(item.value)
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(value) || taken.has(value)) value = uniqueValue(label, taken)
    taken.add(value)
    const card: BriefingToneCard = { value, label }
    if (description) card.description = description
    if (example) card.example = example
    result.push(card)
  }
  return { ok: true, data: result }
}

function validateFields(list: unknown): Result<BriefingField[]> {
  const items = Array.isArray(list) ? list : []
  const taken = new Set<string>()
  const result: BriefingField[] = []
  for (const raw of items) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const label = clean(item.label)
    if (!label) continue
    const placeholder = clean(item.placeholder)
    if (label.length > 120 || placeholder.length > 200) return { ok: false, error: "Campo: nome até 120 e exemplo até 200 caracteres." }
    let key = clean(item.key)
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(key) || taken.has(key)) key = uniqueValue(label, taken)
    taken.add(key)
    result.push(placeholder ? { key, label, placeholder } : { key, label })
  }
  return { ok: true, data: result }
}

function validateExtras(list: unknown): Result<BriefingExtra[]> {
  const items = Array.isArray(list) ? list : []
  const taken = new Set<string>()
  const result: BriefingExtra[] = []
  for (const raw of items) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const label = clean(item.label)
    if (!label) continue
    const placeholder = clean(item.placeholder)
    if (label.length > 120 || placeholder.length > 200) return { ok: false, error: "Complemento: nome até 120 e exemplo até 200 caracteres." }
    const kind = (EXTRA_KINDS as readonly unknown[]).includes(item.kind) ? (item.kind as BriefingExtra["kind"]) : "short_text"
    let key = clean(item.key)
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(key) || taken.has(key)) key = uniqueValue(label, taken)
    taken.add(key)
    const extra: BriefingExtra = { key, kind, label }
    if (placeholder) extra.placeholder = placeholder
    if (item.required === true) extra.required = true
    result.push(extra)
  }
  return { ok: true, data: result }
}

/**
 * Opções conferidas para o tipo. Chaves que o editor não conhece (de uma
 * versão futura, por exemplo) são mantidas como estavam em `previous`.
 */
export function validateOptions(
  kind: BriefingQuestionKind,
  input: unknown,
  previous: Record<string, unknown> = {}
): Result<Record<string, unknown>> {
  const source = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const features = optionFeatures(kind)
  const known = new Set(["choices", "cards", "max", "primary", "other", "voice", "unit", "accept", "fields", "extras", "placeholder"])
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(previous).filter(([key]) => !known.has(key)))

  if (kind === "identification") {
    // Os campos da identificação vão para o briefing (`identification`): ficam como estão.
    if (previous.fields !== undefined) result.fields = previous.fields
    return { ok: true, data: result }
  }

  if (features.choices) {
    const choices = validateChoices(source.choices, "Opção")
    if (!choices.ok) return choices
    if (choices.data.length < 2) return { ok: false, error: "Coloque pelo menos duas opções." }
    if (choices.data.length > 20) return { ok: false, error: "No máximo 20 opções." }
    result.choices = choices.data
  }
  if (features.cards) {
    const cards = validateCards(source.cards)
    if (!cards.ok) return cards
    if (cards.data.length < 2) return { ok: false, error: "Coloque pelo menos dois cards." }
    if (cards.data.length > 12) return { ok: false, error: "No máximo 12 cards." }
    result.cards = cards.data
  }
  if (features.max && source.max !== null && source.max !== undefined && source.max !== "") {
    const max = Number(source.max)
    if (!Number.isInteger(max) || max < 1 || max > 20) return { ok: false, error: "Máximo de escolhas: de 1 a 20." }
    result.max = max
  }
  if (features.primary && source.primary === true) result.primary = true
  if (features.other && source.other === true) result.other = true
  if (features.voice && source.voice === "essential") result.voice = "essential"
  if (features.unit && source.unit === "BRL") result.unit = "BRL"
  if (features.accept) {
    const allowed = new Set<string>(UPLOAD_ACCEPT_OPTIONS.map((option) => option.value))
    const accept = (Array.isArray(source.accept) ? source.accept : []).filter(
      (item): item is string => typeof item === "string" && allowed.has(item)
    )
    if (accept.length === 0) return { ok: false, error: "Escolha que tipo de arquivo a pergunta aceita." }
    result.accept = [...new Set(accept)]
  }
  if (features.fields) {
    const fields = validateFields(source.fields)
    if (!fields.ok) return fields
    if (fields.data.length === 1) return { ok: false, error: "Campos lado a lado: coloque pelo menos dois, ou nenhum." }
    if (fields.data.length > 6) return { ok: false, error: "No máximo 6 campos." }
    if (fields.data.length > 0) result.fields = fields.data
  }
  if (features.placeholder) {
    const placeholder = clean(source.placeholder)
    if (placeholder.length > 200) return { ok: false, error: "Exemplo do campo: até 200 caracteres." }
    if (placeholder) result.placeholder = placeholder
  }
  if (features.extras) {
    const extras = validateExtras(source.extras)
    if (!extras.ok) return extras
    if (extras.data.length > 4) return { ok: false, error: "No máximo 4 complementos." }
    if (extras.data.length > 0) result.extras = extras.data
  }
  return { ok: true, data: result }
}

export function validateQuestionInput(
  input: unknown,
  previous?: { kind: BriefingQuestionKind; options: Record<string, unknown> }
): Result<{ text: string; hint: string | null; kind: BriefingQuestionKind; required: boolean; options: Record<string, unknown> }> {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const text = cleanMultiline(source.text)
  if (!text) return { ok: false, error: "Escreva a pergunta." }
  if (text.length > 500) return { ok: false, error: "Pergunta: até 500 caracteres." }
  const hint = cleanMultiline(source.hint)
  if (hint.length > 500) return { ok: false, error: "Dica: até 500 caracteres." }
  if (!isQuestionKind(source.kind)) return { ok: false, error: "Escolha o tipo da pergunta." }
  const kind = source.kind
  if (previous?.kind === "identification" && kind !== "identification") {
    return { ok: false, error: "A pergunta de identificação não muda de tipo." }
  }
  if (kind === "identification" && previous?.kind !== "identification") {
    return { ok: false, error: "A identificação é fixa no começo do briefing. Escolha outro tipo." }
  }
  const options = validateOptions(kind, source.options, previous?.options ?? {})
  if (!options.ok) return options
  return { ok: true, data: { text, hint: hint || null, kind, required: source.required === true, options: options.data } }
}

/** Opções vazias (com o mínimo) ao escolher um tipo novo no editor. */
export function defaultOptions(kind: BriefingQuestionKind): BriefingQuestionOptions {
  switch (kind) {
    case "choice":
    case "multiple":
      return { choices: [{ value: "", label: "" }, { value: "", label: "" }] }
    case "cards":
      return { cards: [{ value: "", label: "" }, { value: "", label: "" }], max: 2, primary: true }
    case "upload":
      return { accept: ["image/*", "application/pdf"] }
    default:
      return {}
  }
}

/** Ao trocar o tipo no editor, leva o que ainda serve (opções viram cards e vice-versa). */
export function convertOptions(from: BriefingQuestionOptions, kind: BriefingQuestionKind): BriefingQuestionOptions {
  const base = defaultOptions(kind)
  const features = optionFeatures(kind)
  const next: BriefingQuestionOptions = { ...base }
  const labels = from.choices ?? from.cards
  if (features.choices && labels?.length) next.choices = labels.map((item) => ({ value: item.value, label: item.label }))
  if (features.cards && labels?.length) {
    next.cards = labels.map((item) => ({ value: item.value, label: item.label, description: "", example: "" }))
  }
  if (features.max && from.max) next.max = from.max
  if (features.other && from.other) next.other = true
  if (features.placeholder && from.placeholder) next.placeholder = from.placeholder
  if (features.extras && from.extras) next.extras = from.extras
  return next
}

/** Reordena: devolve a lista com o item na nova posição (para cima ou para baixo). */
export function moveInList<T extends { id: string }>(items: readonly T[], id: string, direction: "up" | "down"): T[] | null {
  const index = items.findIndex((item) => item.id === id)
  const target = direction === "up" ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= items.length) return null
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  return next
}

