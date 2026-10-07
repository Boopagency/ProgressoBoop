import { isMetricKey } from "@/features/metrics/catalog"
import { isDateKey } from "@/lib/dates"
import { isMetricUnit, isTaskArea } from "@/lib/labels"
import type { DateKey, MetricUnit, TaskArea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Validação das metas (Server Actions recebem dados de qualquer origem). */

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 5000
const VALUE_MAX = 1e14

export interface ObjectiveInput {
  title: string
  description: string | null
  area: TaskArea | null
  owner_id: string | null
  starts_on: DateKey
  ends_on: DateKey
}

export interface KeyResultInput {
  objective_id: string
  title: string
  metric: string | null
  client_id: string | null
  unit: MetricUnit
  target_value: number
  baseline_value: number | null
  manual_value: number | null
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function title(value: unknown): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text && text.length <= TITLE_MAX ? text : null
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < VALUE_MAX

export function parseObjectivePatch(raw: unknown): Parsed<Partial<ObjectiveInput>> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: Partial<ObjectiveInput> = {}
  if ("title" in input) {
    const value = title(input.title)
    if (!value) return { ok: false, error: "Escreva o objetivo (até 200 letras)." }
    patch.title = value
  }
  if ("description" in input) {
    if (input.description !== null && typeof input.description !== "string") return { ok: false, error: "Descrição inválida." }
    const text = input.description?.trim() ?? ""
    if (text.length > DESCRIPTION_MAX) return { ok: false, error: "Descrição muito longa." }
    patch.description = text || null
  }
  if ("area" in input) {
    if (input.area !== null && !isTaskArea(input.area)) return { ok: false, error: "Área inválida." }
    patch.area = input.area
  }
  if ("owner_id" in input) {
    if (input.owner_id !== null && !isUuid(input.owner_id)) return { ok: false, error: "Responsável inválido." }
    patch.owner_id = input.owner_id
  }
  for (const key of ["starts_on", "ends_on"] as const) {
    if (!(key in input)) continue
    if (!isDateKey(input[key])) return { ok: false, error: "Período inválido." }
    patch[key] = input[key]
  }
  if (patch.starts_on && patch.ends_on && patch.ends_on < patch.starts_on) return { ok: false, error: "O fim não pode ser antes do começo." }
  return { ok: true, value: patch }
}

export function parseObjectiveInput(raw: unknown): Parsed<ObjectiveInput> {
  const parsed = parseObjectivePatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Escreva o objetivo." }
  if (!patch.starts_on || !patch.ends_on) return { ok: false, error: "Escolha o período." }
  return {
    ok: true,
    value: {
      title: patch.title,
      description: patch.description ?? null,
      area: patch.area ?? null,
      owner_id: patch.owner_id ?? null,
      starts_on: patch.starts_on,
      ends_on: patch.ends_on,
    },
  }
}

export function parseKeyResultPatch(raw: unknown): Parsed<Partial<Omit<KeyResultInput, "objective_id">>> {
  const input = record(raw)
  if (!input) return { ok: false, error: "Dados inválidos." }
  const patch: Partial<Omit<KeyResultInput, "objective_id">> = {}
  if ("title" in input) {
    const value = title(input.title)
    if (!value) return { ok: false, error: "Descreva o resultado-chave (até 200 letras)." }
    patch.title = value
  }
  if ("metric" in input) {
    if (input.metric !== null && !isMetricKey(input.metric)) return { ok: false, error: "Indicador inválido." }
    patch.metric = input.metric
  }
  if ("client_id" in input) {
    if (input.client_id !== null && !isUuid(input.client_id)) return { ok: false, error: "Cliente inválido." }
    patch.client_id = input.client_id
  }
  if ("unit" in input) {
    if (!isMetricUnit(input.unit)) return { ok: false, error: "Unidade inválida." }
    patch.unit = input.unit
  }
  if ("target_value" in input) {
    if (!finite(input.target_value)) return { ok: false, error: "Meta inválida." }
    patch.target_value = input.target_value
  }
  for (const key of ["baseline_value", "manual_value"] as const) {
    if (!(key in input)) continue
    if (input[key] !== null && !finite(input[key])) return { ok: false, error: "Valor inválido." }
    patch[key] = input[key] as number | null
  }
  return { ok: true, value: patch }
}

export function parseKeyResultInput(raw: unknown): Parsed<KeyResultInput> {
  const input = record(raw)
  if (!input || !isUuid(input.objective_id)) return { ok: false, error: "Objetivo inválido." }
  const parsed = parseKeyResultPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Descreva o resultado-chave." }
  if (patch.target_value === undefined) return { ok: false, error: "Informe a meta." }
  return {
    ok: true,
    value: {
      objective_id: input.objective_id,
      title: patch.title,
      metric: patch.metric ?? null,
      client_id: patch.client_id ?? null,
      unit: patch.unit ?? "number",
      target_value: patch.target_value,
      baseline_value: patch.baseline_value ?? null,
      manual_value: patch.manual_value ?? null,
    },
  }
}
