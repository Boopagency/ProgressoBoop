import { isDateKey } from "@/lib/dates"
import type { DateKey, MeetingItemKind } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Validação do que chega do cliente nas Server Actions das reuniões. A
 * existência de pessoas, reuniões e tarefas é garantida pelas chaves
 * estrangeiras e pelo RLS.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export const ITEM_MAX = 1000
export const SUMMARY_MAX = 20_000
export const TRANSCRIPT_MAX = 200_000

export interface MeetingItemInput {
  kind: MeetingItemKind
  content: string
  owner_id: string | null
  due_date: DateKey | null
}

export type MeetingItemPatch = Partial<Omit<MeetingItemInput, "kind">> & { done?: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseItemPatch(raw: unknown): Parsed<MeetingItemPatch> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  const patch: MeetingItemPatch = {}

  if ("content" in raw) {
    if (typeof raw.content !== "string") return { ok: false, error: "Texto inválido." }
    const content = raw.content.trim()
    if (!content) return { ok: false, error: "Escreva o texto." }
    if (content.length > ITEM_MAX) return { ok: false, error: "Texto muito longo." }
    patch.content = content
  }

  if ("owner_id" in raw) {
    if (raw.owner_id !== null && !isUuid(raw.owner_id)) {
      return { ok: false, error: "Responsável inválido." }
    }
    patch.owner_id = raw.owner_id
  }

  if ("due_date" in raw) {
    if (raw.due_date !== null && !isDateKey(raw.due_date)) {
      return { ok: false, error: "Prazo inválido." }
    }
    patch.due_date = raw.due_date
  }

  if ("done" in raw) {
    if (typeof raw.done !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.done = raw.done
  }

  return { ok: true, value: patch }
}

export function parseItemInput(raw: unknown): Parsed<MeetingItemInput> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  if (raw.kind !== "topic" && raw.kind !== "agreement") return { ok: false, error: "Dados inválidos." }
  const parsed = parseItemPatch(raw)
  if (!parsed.ok) return parsed
  if (!parsed.value.content) return { ok: false, error: "Escreva o texto." }
  return {
    ok: true,
    value: {
      kind: raw.kind,
      content: parsed.value.content,
      owner_id: parsed.value.owner_id ?? null,
      due_date: parsed.value.due_date ?? null,
    },
  }
}

/** Resumo ou transcrição: texto livre, vazio vira `null`. */
export function parseLongText(raw: unknown, max: number, what: string): Parsed<string | null> {
  if (raw !== null && typeof raw !== "string") return { ok: false, error: "Texto inválido." }
  // Normaliza quebras de linha (Windows) e tira espaços sobrando nas pontas.
  const text = (raw ?? "").replace(/\r\n?/g, "\n").trim()
  if (text.length > max) {
    return { ok: false, error: `${what} muito longa (máximo de ${max.toLocaleString("pt-BR")} caracteres).` }
  }
  return { ok: true, value: text || null }
}
