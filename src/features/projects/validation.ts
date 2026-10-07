import { isDateKey } from "@/lib/dates"
import { isProjectStatus } from "@/lib/labels"
import type { DateKey, ProjectStatus } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/** Campos editáveis de um projeto. */
export interface ProjectInput {
  name: string
  client_id: string | null
  owner_id: string | null
  status: ProjectStatus
  description: string | null
  starts_on: DateKey
  due_on: DateKey | null
  pinned: boolean
}

export type ProjectPatch = Partial<ProjectInput>

/** De onde vêm as tarefas iniciais de um projeto novo. */
export type ProjectSource =
  | { type: "blank" }
  | { type: "template"; key: string }
  | { type: "project"; id: string }
  | { type: "doc"; id: string }

export const NAME_MAX = 200
export const DESCRIPTION_MAX = 5000

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null
  if (isUuid(value)) return value
  return undefined
}

export function parseProjectPatch(raw: unknown): Parsed<ProjectPatch> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  const patch: ProjectPatch = {}

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : ""
    if (!name) return { ok: false, error: "Dê um nome ao projeto." }
    if (name.length > NAME_MAX) return { ok: false, error: "Nome muito longo." }
    patch.name = name
  }
  if ("client_id" in raw) {
    const clientId = optionalId(raw.client_id)
    if (clientId === undefined) return { ok: false, error: "Cliente inválido." }
    patch.client_id = clientId
  }
  if ("owner_id" in raw) {
    const ownerId = optionalId(raw.owner_id)
    if (ownerId === undefined) return { ok: false, error: "Responsável inválido." }
    patch.owner_id = ownerId
  }
  if ("status" in raw) {
    if (!isProjectStatus(raw.status)) return { ok: false, error: "Status inválido." }
    patch.status = raw.status
  }
  if ("description" in raw) {
    if (raw.description !== null && typeof raw.description !== "string") {
      return { ok: false, error: "Descrição inválida." }
    }
    const description = raw.description?.trim() ?? ""
    if (description.length > DESCRIPTION_MAX) return { ok: false, error: "Descrição muito longa." }
    patch.description = description || null
  }
  if ("starts_on" in raw) {
    if (!isDateKey(raw.starts_on)) return { ok: false, error: "Data de começo inválida." }
    patch.starts_on = raw.starts_on
  }
  if ("due_on" in raw) {
    if (raw.due_on !== null && !isDateKey(raw.due_on)) return { ok: false, error: "Prazo inválido." }
    patch.due_on = raw.due_on
  }
  if ("pinned" in raw) {
    if (typeof raw.pinned !== "boolean") return { ok: false, error: "Dados inválidos." }
    patch.pinned = raw.pinned
  }
  if (patch.starts_on && patch.due_on && patch.due_on < patch.starts_on) {
    return { ok: false, error: "O prazo não pode ser antes do começo." }
  }
  return { ok: true, value: patch }
}

export function parseProjectInput(raw: unknown): Parsed<ProjectInput> {
  const parsed = parseProjectPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.name) return { ok: false, error: "Dê um nome ao projeto." }
  if (!patch.starts_on) return { ok: false, error: "Escolha quando o projeto começa." }
  return {
    ok: true,
    value: {
      name: patch.name,
      client_id: patch.client_id ?? null,
      owner_id: patch.owner_id ?? null,
      status: patch.status ?? "active",
      description: patch.description ?? null,
      starts_on: patch.starts_on,
      due_on: patch.due_on ?? null,
      pinned: patch.pinned ?? false,
    },
  }
}

export function parseProjectSource(raw: unknown): ProjectSource | null {
  if (!isRecord(raw)) return null
  if (raw.type === "blank") return { type: "blank" }
  if (raw.type === "template" && typeof raw.key === "string") return { type: "template", key: raw.key }
  if ((raw.type === "project" || raw.type === "doc") && isUuid(raw.id)) return { type: raw.type, id: raw.id }
  return null
}
