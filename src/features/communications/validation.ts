import { isDateKey } from "@/lib/dates"
import { isCommunicationChannel, isCommunicationKind } from "@/lib/labels"
import type { CommunicationChannel, CommunicationKind, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/** Campos editáveis de uma comunicação. */
export interface CommunicationInput {
  client_id: string
  project_id: string | null
  kind: CommunicationKind
  channel: CommunicationChannel
  summary: string
  details: string | null
  occurred_on: DateKey
}

export type CommunicationPatch = Partial<CommunicationInput>

export const SUMMARY_MAX = 300
export const DETAILS_MAX = 5000

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseCommunicationPatch(raw: unknown): Parsed<CommunicationPatch> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Dados inválidos." }
  const input = raw as Record<string, unknown>
  const patch: CommunicationPatch = {}
  if ("client_id" in input) {
    if (!isUuid(input.client_id)) return { ok: false, error: "Escolha o cliente." }
    patch.client_id = input.client_id
  }
  if ("project_id" in input) {
    if (input.project_id !== null && !isUuid(input.project_id)) return { ok: false, error: "Projeto inválido." }
    patch.project_id = input.project_id
  }
  if ("kind" in input) {
    if (!isCommunicationKind(input.kind)) return { ok: false, error: "Tipo inválido." }
    patch.kind = input.kind
  }
  if ("channel" in input) {
    if (!isCommunicationChannel(input.channel)) return { ok: false, error: "Canal inválido." }
    patch.channel = input.channel
  }
  if ("summary" in input) {
    const summary = typeof input.summary === "string" ? input.summary.replace(/\s+/g, " ").trim() : ""
    if (!summary) return { ok: false, error: "Resuma o que foi falado." }
    if (summary.length > SUMMARY_MAX) return { ok: false, error: "Resumo muito longo (use os detalhes)." }
    patch.summary = summary
  }
  if ("details" in input) {
    if (input.details !== null && typeof input.details !== "string") return { ok: false, error: "Detalhes inválidos." }
    const details = input.details?.trim() ?? ""
    if (details.length > DETAILS_MAX) return { ok: false, error: "Detalhes muito longos." }
    patch.details = details || null
  }
  if ("occurred_on" in input) {
    if (!isDateKey(input.occurred_on)) return { ok: false, error: "Data inválida." }
    patch.occurred_on = input.occurred_on
  }
  return { ok: true, value: patch }
}

export function parseCommunicationInput(raw: unknown): Parsed<CommunicationInput> {
  const parsed = parseCommunicationPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.client_id) return { ok: false, error: "Escolha o cliente." }
  if (!patch.summary) return { ok: false, error: "Resuma o que foi falado." }
  if (!patch.occurred_on) return { ok: false, error: "Escolha a data." }
  return {
    ok: true,
    value: {
      client_id: patch.client_id,
      project_id: patch.project_id ?? null,
      kind: patch.kind ?? "update",
      channel: patch.channel ?? "whatsapp",
      summary: patch.summary,
      details: patch.details ?? null,
      occurred_on: patch.occurred_on,
    },
  }
}
