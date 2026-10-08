import { isContentFormat } from "@/lib/labels"
import type { ContentFormat } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação do banco de ideias (Server Actions recebem dados de qualquer origem). */

export const IDEA_TITLE_MAX = 200
export const IDEA_NOTES_MAX = 5000
export const REFERENCE_URL_MAX = 2000

export interface IdeaInput {
  client_id: string
  title: string
  notes: string | null
  /** Formato pensado para o post (opcional; ao virar post, é escolhido se faltar). */
  format: ContentFormat | null
  /** Link de referência (post, perfil, vídeo); só http(s). */
  reference_url: string | null
}

export type IdeaPatch = Partial<IdeaInput>

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/**
 * Link de referência: vazio vira null; sem "https://" mas com cara de
 * endereço ("instagram.com/p/…"), ganha o "https://". Inválido: undefined.
 */
export function normalizeReferenceUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return undefined
  const text = value.trim()
  if (!text) return null
  const url = /^https?:\/\//i.test(text) ? text : /^[^\s/.]+\.[^\s]+$/.test(text) ? `https://${text}` : null
  if (!url || /\s/.test(url) || url.length > REFERENCE_URL_MAX) return undefined
  return url
}

export function parseIdeaPatch(raw: unknown): Parsed<IdeaPatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: IdeaPatch = {}

  if ("client_id" in input) {
    if (!isUuid(input.client_id)) return { ok: false, error: "Escolha o cliente." }
    patch.client_id = input.client_id
  }
  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, error: "Dê um título à ideia." }
    if (title.length > IDEA_TITLE_MAX) return { ok: false, error: "Título muito longo." }
    patch.title = title
  }
  if ("notes" in input) {
    const notes = input.notes ?? null
    if (notes !== null && typeof notes !== "string") return { ok: false, error: "Notas inválidas." }
    const text = (notes ?? "").replace(/\r\n?/g, "\n").trim()
    if (text.length > IDEA_NOTES_MAX) return { ok: false, error: "Notas muito longas." }
    patch.notes = text || null
  }
  if ("format" in input) {
    const format = input.format ?? null
    if (format !== null && !isContentFormat(format)) return { ok: false, error: "Formato inválido." }
    patch.format = format
  }
  if ("reference_url" in input) {
    const url = normalizeReferenceUrl(input.reference_url)
    if (url === undefined) return { ok: false, error: "Link de referência inválido (comece com https://)." }
    patch.reference_url = url
  }
  return { ok: true, value: patch }
}

/** Criação: cliente e título obrigatórios; o resto é opcional. */
export function parseIdeaInput(raw: unknown): Parsed<IdeaInput> {
  const parsed = parseIdeaPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.client_id) return { ok: false, error: "Escolha o cliente." }
  if (!patch.title) return { ok: false, error: "Dê um título à ideia." }
  return {
    ok: true,
    value: {
      client_id: patch.client_id,
      title: patch.title,
      notes: patch.notes ?? null,
      format: patch.format ?? null,
      reference_url: patch.reference_url ?? null,
    },
  }
}
