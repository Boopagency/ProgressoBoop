import { isDateKey } from "@/lib/dates"
import { isDecisionStatus, isTaskArea } from "@/lib/labels"
import type { DateKey, DecisionStatus, TaskArea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/** Campos editáveis de uma decisão. */
export interface DecisionInput {
  title: string
  context: string | null
  decided_on: DateKey
  status: DecisionStatus
  area: TaskArea | null
  client_id: string | null
  project_id: string | null
  meeting_id: string | null
}

export type DecisionPatch = Partial<DecisionInput>

export const TITLE_MAX = 300
export const CONTEXT_MAX = 5000

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null
  if (isUuid(value)) return value
  return undefined
}

export function parseDecisionPatch(raw: unknown): Parsed<DecisionPatch> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Dados inválidos." }
  const input = raw as Record<string, unknown>
  const patch: DecisionPatch = {}
  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, error: "Escreva o que foi decidido." }
    if (title.length > TITLE_MAX) return { ok: false, error: "Texto muito longo (use o contexto para os detalhes)." }
    patch.title = title
  }
  if ("context" in input) {
    if (input.context !== null && typeof input.context !== "string") return { ok: false, error: "Contexto inválido." }
    const context = input.context?.trim() ?? ""
    if (context.length > CONTEXT_MAX) return { ok: false, error: "Contexto muito longo." }
    patch.context = context || null
  }
  if ("decided_on" in input) {
    if (!isDateKey(input.decided_on)) return { ok: false, error: "Data inválida." }
    patch.decided_on = input.decided_on
  }
  if ("status" in input) {
    if (!isDecisionStatus(input.status)) return { ok: false, error: "Situação inválida." }
    patch.status = input.status
  }
  if ("area" in input) {
    if (input.area !== null && !isTaskArea(input.area)) return { ok: false, error: "Área inválida." }
    patch.area = input.area
  }
  for (const key of ["client_id", "project_id", "meeting_id"] as const) {
    if (key in input) {
      const id = optionalId(input[key])
      if (id === undefined) return { ok: false, error: "Vínculo inválido." }
      patch[key] = id
    }
  }
  return { ok: true, value: patch }
}

export function parseDecisionInput(raw: unknown): Parsed<DecisionInput> {
  const parsed = parseDecisionPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Escreva o que foi decidido." }
  if (!patch.decided_on) return { ok: false, error: "Escolha a data da decisão." }
  return {
    ok: true,
    value: {
      title: patch.title,
      context: patch.context ?? null,
      decided_on: patch.decided_on,
      status: patch.status ?? "active",
      area: patch.area ?? null,
      client_id: patch.client_id ?? null,
      project_id: patch.project_id ?? null,
      meeting_id: patch.meeting_id ?? null,
    },
  }
}
