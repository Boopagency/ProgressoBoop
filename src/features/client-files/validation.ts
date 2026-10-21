import { CLIENT_FILE_DESCRIPTION_MAX, CLIENT_FILE_NAME_MAX } from "@/features/client-files/logic"
import { isClientFileCategory } from "@/lib/labels"
import type { ClientFileCategory } from "@/lib/types"

/* Validação dos documentos do cliente (Server Actions recebem dados de qualquer origem). */

/** O que a equipe escolhe para o documento (o arquivo em si não muda depois de enviado). */
export interface ClientFileFields {
  name: string
  category: ClientFileCategory
  description: string | null
  client_visible: boolean
}

export type ClientFilePatch = Partial<ClientFileFields>

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

export function parseClientFilePatch(raw: unknown): Parsed<ClientFilePatch> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: ClientFilePatch = {}

  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : ""
    if (!name) return { ok: false, error: "Dê um nome ao documento." }
    if (name.length > CLIENT_FILE_NAME_MAX) return { ok: false, error: "Nome muito longo." }
    patch.name = name
  }
  if ("category" in input) {
    if (!isClientFileCategory(input.category)) return { ok: false, error: "Escolha o tipo do documento." }
    patch.category = input.category
  }
  if ("description" in input) {
    const description = input.description ?? null
    if (description !== null && typeof description !== "string") return { ok: false, error: "Descrição inválida." }
    const text = description?.trim() ?? ""
    if (text.length > CLIENT_FILE_DESCRIPTION_MAX) return { ok: false, error: "Descrição muito longa." }
    patch.description = text || null
  }
  if ("client_visible" in input) {
    if (typeof input.client_visible !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.client_visible = input.client_visible
  }
  return { ok: true, value: patch }
}

export function parseClientFileFields(raw: unknown): Parsed<ClientFileFields> {
  const parsed = parseClientFilePatch(raw)
  if (!parsed.ok) return parsed
  const { name, category, description, client_visible } = parsed.value
  if (name === undefined) return { ok: false, error: "Dê um nome ao documento." }
  return {
    ok: true,
    value: { name, category: category ?? "other", description: description ?? null, client_visible: client_visible ?? true },
  }
}
