import { defaultFronts, MAX_SLIDES } from "@/features/content/logic"
import { isDateKey } from "@/lib/dates"
import {
  CONTENT_FRONTS,
  isContentFormat,
  isContentFrontStatus,
  isContentIntent,
  isContentNetwork,
  isContentStage,
} from "@/lib/labels"
import type {
  ContentFormat,
  ContentFront,
  ContentFrontStatus,
  ContentIntent,
  ContentNetwork,
  ContentSlide,
  ContentStage,
  DateKey,
} from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação da Central de Conteúdo (Server Actions recebem dados de qualquer origem). */

export const TITLE_MAX = 200
export const BRIEF_MAX = 5000
export const DESIGN_NOTES_MAX = 5000
export const SCRIPT_MAX = 10000
export const CAPTION_MAX = 5000
export const SLIDE_TEXT_MAX = 2000
export const DRIVE_URL_MAX = 2000
const IMAGE_PATH_MAX = 500
const INTENTS_MAX = 5

export interface PostInput {
  title: string
  client_id: string
  project_id: string | null
  format: ContentFormat
  networks: ContentNetwork[]
  intents: ContentIntent[]
  publish_on: DateKey | null
  /** `HH:mm` (São Paulo); só com dia. */
  publish_time: string | null
  stage: ContentStage
  copy_status: ContentFrontStatus
  design_status: ContentFrontStatus
  video_status: ContentFrontStatus
  owner_id: string | null
  brief: string | null
  design_notes: string | null
  script: string | null
  slides: ContentSlide[]
  caption: string | null
  drive_url: string | null
}

export type PostPatch = Partial<PostInput>

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** Texto de várias linhas: pontas aparadas, quebras normalizadas, vazio vira null. */
function longText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false }
  const text = value.replace(/\r\n?/g, "\n").trim()
  if (text.length > max) return { ok: false }
  return { ok: true, value: text || null }
}

/** Lista de valores conhecidos, sem repetição. */
function enumList<T extends string>(value: unknown, valid: (item: unknown) => item is T): T[] | null {
  if (!Array.isArray(value) || !value.every(valid)) return null
  return [...new Set(value)]
}

function parseSlides(value: unknown): ContentSlide[] | null {
  if (!Array.isArray(value) || value.length > MAX_SLIDES) return null
  const slides: ContentSlide[] = []
  for (const raw of value) {
    const slide = record(raw)
    if (!slide || typeof slide.text !== "string") return null
    const text = slide.text.replace(/\r\n?/g, "\n").trim()
    if (text.length > SLIDE_TEXT_MAX) return null
    const path = slide.image_path ?? null
    if (path !== null && (typeof path !== "string" || path.length === 0 || path.length > IMAGE_PATH_MAX)) return null
    slides.push({ text, image_path: path })
  }
  return slides
}

export function parsePostPatch(raw: unknown): Parsed<PostPatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: PostPatch = {}

  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, error: "Dê um título ao post." }
    if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
    patch.title = title
  }
  if ("client_id" in input) {
    if (!isUuid(input.client_id)) return { ok: false, error: "Escolha o cliente." }
    patch.client_id = input.client_id
  }
  for (const key of ["project_id", "owner_id"] as const) {
    if (!(key in input)) continue
    if (input[key] !== null && !isUuid(input[key])) return { ok: false, error: "Vínculo inválido." }
    patch[key] = input[key] as string | null
  }
  if ("format" in input) {
    if (!isContentFormat(input.format)) return { ok: false, error: "Formato inválido." }
    patch.format = input.format
  }
  if ("networks" in input) {
    const networks = enumList(input.networks, isContentNetwork)
    if (!networks) return { ok: false, error: "Rede inválida." }
    if (networks.length === 0) return { ok: false, error: "Escolha pelo menos uma rede." }
    patch.networks = networks
  }
  if ("intents" in input) {
    const intents = enumList(input.intents, isContentIntent)
    if (!intents || intents.length > INTENTS_MAX) return { ok: false, error: "Intenção inválida." }
    patch.intents = intents
  }
  if ("publish_on" in input) {
    if (input.publish_on !== null && !isDateKey(input.publish_on)) return { ok: false, error: "Data de publicação inválida." }
    patch.publish_on = input.publish_on
    // Sem dia, sem horário (regra do banco).
    if (input.publish_on === null) patch.publish_time = null
  }
  if ("publish_time" in input && patch.publish_time === undefined) {
    const time = input.publish_time
    if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(time))) {
      return { ok: false, error: "Horário inválido." }
    }
    patch.publish_time = time === null ? null : time.slice(0, 5)
  }
  if ("stage" in input) {
    if (!isContentStage(input.stage)) return { ok: false, error: "Etapa inválida." }
    patch.stage = input.stage
  }
  for (const front of CONTENT_FRONTS) {
    const key = `${front}_status` as const
    if (!(key in input)) continue
    const status = input[key]
    if (!isContentFrontStatus(status)) return { ok: false, error: "Situação da frente inválida." }
    patch[key] = status
  }
  const texts = [
    ["brief", BRIEF_MAX, "Conteúdo muito longo."],
    ["design_notes", DESIGN_NOTES_MAX, "Orientação muito longa."],
    ["script", SCRIPT_MAX, "Roteiro muito longo."],
    ["caption", CAPTION_MAX, "Legenda muito longa."],
  ] as const
  for (const [key, max, message] of texts) {
    if (!(key in input)) continue
    const parsed = longText(input[key], max)
    if (!parsed.ok) return { ok: false, error: message }
    patch[key] = parsed.value
  }
  if ("slides" in input) {
    const slides = parseSlides(input.slides)
    if (!slides) return { ok: false, error: `Slides inválidos (até ${MAX_SLIDES}, com até ${SLIDE_TEXT_MAX.toLocaleString("pt-BR")} letras cada).` }
    patch.slides = slides
  }
  if ("drive_url" in input) {
    const parsed = longText(input.drive_url, DRIVE_URL_MAX)
    if (!parsed.ok || (parsed.value !== null && (/\s/.test(parsed.value) || !/^https?:\/\//i.test(parsed.value)))) {
      return { ok: false, error: "Link do Drive inválido (comece com https://)." }
    }
    patch.drive_url = parsed.value
  }
  return { ok: true, value: patch }
}

/** Criação: título, cliente e formato obrigatórios; o resto tem padrão. */
export function parsePostInput(raw: unknown): Parsed<PostInput> {
  const parsed = parsePostPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Dê um título ao post." }
  if (!patch.client_id) return { ok: false, error: "Escolha o cliente." }
  if (!patch.format) return { ok: false, error: "Escolha o formato." }
  const publishOn = patch.publish_on ?? null
  const publishTime = patch.publish_time ?? null
  if (publishTime !== null && publishOn === null) return { ok: false, error: "Escolha o dia antes do horário." }
  const fronts = defaultFronts(patch.format)
  return {
    ok: true,
    value: {
      title: patch.title,
      client_id: patch.client_id,
      project_id: patch.project_id ?? null,
      format: patch.format,
      networks: patch.networks ?? ["instagram"],
      intents: patch.intents ?? [],
      publish_on: publishOn,
      publish_time: publishTime,
      stage: patch.stage ?? "production",
      copy_status: patch.copy_status ?? fronts.copy_status,
      design_status: patch.design_status ?? fronts.design_status,
      video_status: patch.video_status ?? fronts.video_status,
      owner_id: patch.owner_id ?? null,
      brief: patch.brief ?? null,
      design_notes: patch.design_notes ?? null,
      script: patch.script ?? null,
      slides: patch.slides ?? [],
      caption: patch.caption ?? null,
      drive_url: patch.drive_url ?? null,
    },
  }
}

export interface FrontTaskInput {
  front: ContentFront
  assignee_ids: string[]
  due_date: DateKey | null
}

/** Tarefas das frentes: uma por frente (sem repetir), com pelo menos um responsável. */
export function parseFrontTasks(raw: unknown): Parsed<FrontTaskInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Escolha pelo menos uma frente." }
  if (raw.length > CONTENT_FRONTS.length) return { ok: false, error: "Frentes inválidas." }
  const items: FrontTaskInput[] = []
  for (const value of raw) {
    const item = record(value)
    if (!item || !CONTENT_FRONTS.includes(item.front as ContentFront)) return { ok: false, error: "Frente inválida." }
    if (items.some((other) => other.front === item.front)) return { ok: false, error: "Frente repetida." }
    const assignees = Array.isArray(item.assignee_ids) ? [...new Set(item.assignee_ids)] : []
    if (assignees.length === 0 || !assignees.every(isUuid)) return { ok: false, error: "Escolha pelo menos um responsável." }
    const due = item.due_date ?? null
    if (due !== null && !isDateKey(due)) return { ok: false, error: "Prazo inválido." }
    items.push({ front: item.front as ContentFront, assignee_ids: assignees, due_date: due })
  }
  return { ok: true, value: items }
}
