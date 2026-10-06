import { isDocKind, isDocStatus, isTaskArea } from "@/lib/labels"
import type { DocKind, DocStatus, TaskArea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Validação do que chega do cliente nas Server Actions dos processos. A
 * existência de clientes e pessoas é garantida pelas chaves estrangeiras.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export const TITLE_MAX = 200
export const SUMMARY_MAX = 500
/** Tamanho máximo do conteúdo (JSON dos blocos), em caracteres. */
export const CONTENT_MAX = 900_000
/** Texto puro guardado para a busca (limite da coluna content_text). */
export const TEXT_MAX = 300_000

export interface DocPatch {
  title?: string
  kind?: DocKind
  status?: DocStatus
  area?: TaskArea | null
  client_id?: string | null
  owner_id?: string | null
  summary?: string | null
  review_every_months?: number | null
  pinned?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null
  return isUuid(value) ? value : undefined
}

export function parseDocPatch(raw: unknown): Parsed<DocPatch> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  const patch: DocPatch = {}

  if ("title" in raw) {
    if (typeof raw.title !== "string") return { ok: false, error: "Título inválido." }
    const title = raw.title.replace(/\s+/g, " ").trim()
    if (!title) return { ok: false, error: "Dê um título ao documento." }
    if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
    patch.title = title
  }
  if ("kind" in raw) {
    if (!isDocKind(raw.kind)) return { ok: false, error: "Tipo inválido." }
    patch.kind = raw.kind
  }
  if ("status" in raw) {
    if (!isDocStatus(raw.status)) return { ok: false, error: "Status inválido." }
    patch.status = raw.status
  }
  if ("area" in raw) {
    if (raw.area !== null && !isTaskArea(raw.area)) return { ok: false, error: "Área inválida." }
    patch.area = raw.area
  }
  for (const key of ["client_id", "owner_id"] as const) {
    if (key in raw) {
      const value = optionalId(raw[key])
      if (value === undefined) return { ok: false, error: "Dados inválidos." }
      patch[key] = value
    }
  }
  if ("summary" in raw) {
    if (raw.summary !== null && typeof raw.summary !== "string") {
      return { ok: false, error: "Texto inválido." }
    }
    const summary = (raw.summary ?? "").replace(/\s+/g, " ").trim()
    if (summary.length > SUMMARY_MAX) return { ok: false, error: "Texto muito longo." }
    patch.summary = summary || null
  }
  if ("review_every_months" in raw) {
    const months = raw.review_every_months
    if (months !== null && !(Number.isInteger(months) && (months as number) >= 1 && (months as number) <= 24)) {
      return { ok: false, error: "Período de revisão inválido." }
    }
    patch.review_every_months = months as number | null
  }
  if ("pinned" in raw) {
    if (typeof raw.pinned !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.pinned = raw.pinned
  }

  return { ok: true, value: patch }
}

/** Conteúdo do editor: lista de blocos (objetos com `type`). */
export function parseContent(raw: unknown): Parsed<Record<string, unknown>[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Conteúdo inválido." }
  if (!raw.every((block) => isRecord(block) && typeof block.type === "string")) {
    return { ok: false, error: "Conteúdo inválido." }
  }
  if (JSON.stringify(raw).length > CONTENT_MAX) {
    return { ok: false, error: "Documento grande demais. Divida em dois ou tire imagens coladas como texto." }
  }
  return { ok: true, value: raw as Record<string, unknown>[] }
}
