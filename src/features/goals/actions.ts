"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { defaultBaseline, metricValue, periodShortcuts, suggestTargets, type TargetSuggestion } from "@/features/goals/logic"
import {
  parseKeyResultInput,
  parseKeyResultPatch,
  parseObjectiveInput,
  parseObjectivePatch,
  type KeyResultInput,
  type ObjectiveInput,
} from "@/features/goals/validation"
import { METRIC_BY_KEY } from "@/features/metrics/catalog"
import { buildContext } from "@/features/metrics/dashboard"
import { getMetricsSource } from "@/features/metrics/queries"
import { isDateKey, todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions das metas (objetivos e resultados-chave). */

const OBJECTIVE_NOT_FOUND = { ok: false, error: "Esse objetivo não existe mais." } as const
const KEY_RESULT_NOT_FOUND = { ok: false, error: "Esse resultado-chave não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

export async function createObjective(input: ObjectiveInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseObjectiveInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("objectives").insert(parsed.value).select("id").single()
  if (error) return dbFailure(error, "Não foi possível criar o objetivo.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateObjective(id: string, patch: Partial<ObjectiveInput>): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return OBJECTIVE_NOT_FOUND
  const parsed = parseObjectivePatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("objectives").update(parsed.value).eq("id", id).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "O fim não pode ser antes do começo." }
    return dbFailure(error, "Não foi possível salvar o objetivo.")
  }
  if (data.length === 0) return OBJECTIVE_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteObjective(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return OBJECTIVE_NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("objectives").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o objetivo.")
  if (data.length === 0) return OBJECTIVE_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function createKeyResult(input: KeyResultInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parseKeyResultInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  // Vai para o fim da lista do objetivo.
  const { count, error: countError } = await supabase
    .from("key_results")
    .select("id", { count: "exact", head: true })
    .eq("objective_id", parsed.value.objective_id)
  if (countError) return dbFailure(countError, "Não foi possível criar o resultado-chave.")
  const { data, error } = await supabase
    .from("key_results")
    .insert({ ...parsed.value, position: Math.min(count ?? 0, 32000) })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23503") return OBJECTIVE_NOT_FOUND
    return dbFailure(error, "Não foi possível criar o resultado-chave.")
  }
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

export async function updateKeyResult(id: string, patch: Partial<Omit<KeyResultInput, "objective_id">>): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return KEY_RESULT_NOT_FOUND
  const parsed = parseKeyResultPatch(patch)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("key_results").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o resultado-chave.")
  if (data.length === 0) return KEY_RESULT_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export async function deleteKeyResult(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return KEY_RESULT_NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("key_results").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o resultado-chave.")
  if (data.length === 0) return KEY_RESULT_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

export interface KeyResultPreview {
  /** Valor do indicador no período do objetivo (realizado até hoje). */
  current: number | null
  /** Base padrão (zero para fluxo; o valor no começo do período para estoque). */
  baseline: number
  suggestions: TargetSuggestion[]
}

/** Valor atual, base e sugestões de meta de um indicador no período (para o formulário). */
export async function previewKeyResult(
  metricKey: string,
  startsOn: string,
  endsOn: string,
  clientId: string | null
): Promise<ActionResult<KeyResultPreview>> {
  await requireUser()
  const metric = METRIC_BY_KEY.get(metricKey)
  if (!metric || !isDateKey(startsOn) || !isDateKey(endsOn) || (clientId !== null && !isUuid(clientId))) {
    return { ok: false, error: "Dados inválidos." }
  }
  const ctx = buildContext(await getMetricsSource(), todayKey())
  const objective = { starts_on: startsOn, ends_on: endsOn }
  const scoped = metric.perClient ? clientId : null
  return {
    ok: true,
    data: {
      current: metricValue(ctx, metric, objective, scoped),
      baseline: defaultBaseline(ctx, metric, objective, scoped),
      suggestions: suggestTargets(ctx, metric, objective, scoped),
    },
  }
}

/**
 * Primeira meta, a partir da planilha: "Meta de MRR" (R$ 5.000) virou um
 * objetivo do trimestre com o MRR como resultado-chave automático.
 */
export async function createStarterGoal(): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const shortcut = periodShortcuts(todayKey())[1]!
  const created = await createObjective({
    title: "Crescer a receita recorrente",
    description: "Meta de MRR da planilha financeira. O progresso sai dos contratos lançados no financeiro.",
    area: "commercial",
    owner_id: user.id,
    starts_on: shortcut.starts_on,
    ends_on: shortcut.ends_on,
  })
  if (!created.ok) return created
  const keyResult = await createKeyResult({
    objective_id: created.data.id,
    title: "MRR de R$ 5.000",
    metric: "mrr",
    client_id: null,
    unit: "money",
    target_value: 500000,
    baseline_value: null,
    manual_value: null,
  })
  if (!keyResult.ok) return keyResult
  return created
}
