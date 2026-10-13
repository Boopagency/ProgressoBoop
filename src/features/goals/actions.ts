"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { defaultBaseline, metricValue, periodShortcuts, suggestTargets, type TargetSuggestion } from "@/features/goals/logic"
import {
  insertKeyResult,
  insertObjective,
  patchKeyResult,
  patchObjective,
  removeKeyResult,
  removeObjective,
} from "@/features/goals/mutations"
import type { KeyResultInput, ObjectiveInput } from "@/features/goals/validation"
import { METRIC_BY_KEY } from "@/features/metrics/catalog"
import { buildContext } from "@/features/metrics/dashboard"
import { getMetricsSource } from "@/features/metrics/queries"
import { isDateKey, todayKey } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/* Server Actions das metas: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createObjective(input: ObjectiveInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertObjective(await createClient(), input))
}

export async function updateObjective(id: string, patch: Partial<ObjectiveInput>): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchObjective(await createClient(), id, patch))
}

export async function deleteObjective(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeObjective(await createClient(), id))
}

export async function createKeyResult(input: KeyResultInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertKeyResult(await createClient(), input))
}

export async function updateKeyResult(id: string, patch: Partial<Omit<KeyResultInput, "objective_id">>): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchKeyResult(await createClient(), id, patch))
}

export async function deleteKeyResult(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeKeyResult(await createClient(), id))
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
