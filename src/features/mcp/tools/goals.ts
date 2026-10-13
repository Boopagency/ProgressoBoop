import "server-only"

import { inputToValue } from "@/features/goals/goal-values"
import { GOAL_STATE_LABEL, periodShortcuts } from "@/features/goals/logic"
import { insertKeyResult, insertObjective, patchKeyResult, patchObjective, removeKeyResult, removeObjective } from "@/features/goals/mutations"
import { fetchGoals } from "@/features/goals/queries"
import { goalsView } from "@/features/goals/view-model"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, findByName, isClear, joinSections, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import {
  CONFIRM,
  DESTRUCTIVE,
  EDIT,
  READ_ONLY,
  WRITE,
  confirmFirst,
  enumOptions,
  enumValue,
  findClient,
  findPerson,
  readOptionalDate,
} from "@/features/mcp/tools/common"
import { METRICS, type MetricDefinition } from "@/features/metrics/catalog"
import { buildContext } from "@/features/metrics/dashboard"
import { formatMetric } from "@/features/metrics/format"
import { fetchMetricsSource } from "@/features/metrics/queries"
import { formatShortDate } from "@/lib/dates"
import { METRIC_UNITS, METRIC_UNIT_LABEL, TASK_AREAS, TASK_AREA_LABEL } from "@/lib/labels"
import type { KeyResult, MetricUnit, Objective } from "@/lib/types"

/*
 * Metas pelo conector: objetivos e resultados-chave com o progresso (o mesmo
 * cálculo da tela, a partir dos indicadores), criar, editar (inclusive
 * atualizar o valor de um resultado manual) e excluir. Dinheiro em reais. As
 * gravações passam por features/goals/mutations.ts.
 */

type Args = Record<string, unknown>

const OBJECTIVE_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  descricao: { type: "string", maxLength: 5000, description: "\"nenhum\" apaga." },
  area: { type: "string", enum: enumOptions(TASK_AREAS, TASK_AREA_LABEL), description: "\"nenhum\" tira." },
  responsavel: { type: "string", description: "Pessoa da equipe (\"eu\" = você). \"nenhum\" tira." },
  inicio: { type: "string", description: "Começo (aaaa-mm-dd). Padrão: o começo do trimestre." },
  fim: { type: "string", description: "Fim (aaaa-mm-dd). Padrão: o fim do trimestre." },
} as const

function readObjectivePatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  if ("descricao" in args) patch.description = isClear(args.descricao) ? null : args.descricao
  if ("area" in args) {
    const raw = readText(args, "area", 40)
    const area = isClear(args.area) ? null : enumValue(raw.ok ? raw.value : null, TASK_AREAS, TASK_AREA_LABEL)
    if (area === undefined) return { ok: false, error: `Área inválida. Opções: ${TASK_AREAS.map((value) => TASK_AREA_LABEL[value]).join(", ")}.` }
    patch.area = area
  }
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) patch.owner_id = null
    else {
      const person = findPerson(directory, String(args.responsavel), context.user.id)
      if (!person.ok) return person
      patch.owner_id = person.value.id
    }
  }
  for (const [key, field] of [["inicio", "starts_on"], ["fim", "ends_on"]] as const) {
    const date = readOptionalDate(args, key, context.today)
    if (!date.ok) return date
    if (date.value) patch[field] = date.value
  }
  return { ok: true, value: patch }
}

const KEY_RESULT_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  indicador: {
    type: "string",
    description: `Indicador automático (chave ou nome): ${METRICS.map((metric) => `${metric.key} (${metric.label})`).join(", ")}. "nenhum" = resultado manual.`,
  },
  cliente: { type: "string", description: "Cliente, nos indicadores por cliente. \"nenhum\" tira." },
  unidade: { type: "string", enum: enumOptions(METRIC_UNITS, METRIC_UNIT_LABEL), description: "Nos resultados manuais (os automáticos usam a do indicador)." },
  meta: { description: "Valor-alvo na unidade (reais para dinheiro, pontos para percentual)." },
  base: { description: "Valor de partida. \"nenhum\" = o padrão do indicador." },
  valor_atual: { description: "Valor atual de um resultado manual. \"nenhum\" apaga." },
} as const

/** Pela chave exata ("mrr") ou pelo nome ("MRR"). */
function findMetric(query: string): Parsed<MetricDefinition> {
  const byKey = METRICS.find((metric) => metric.key === query.trim())
  return byKey ? { ok: true, value: byKey } : findByName(METRICS, query, (metric) => metric.label, (metric) => metric.key, "indicador")
}

/** Valor de meta na unidade: número ou texto ("5.000", "R$ 5.000,00", "25%"). */
function readValue(args: Args, key: string, unit: MetricUnit): Parsed<number | null | undefined> {
  if (!(key in args)) return { ok: true, value: undefined }
  const raw = args[key]
  if (isClear(raw)) return { ok: true, value: null }
  if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: unit === "money" ? Math.round(raw * 100) : raw }
  const value = typeof raw === "string" ? inputToValue(raw, unit) : null
  return value === null ? { ok: false, error: `Valor inválido em "${key}".` } : { ok: true, value }
}

function readKeyResultPatch(args: Args, directory: Directory, current: KeyResult | null): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  let unit: MetricUnit = current?.unit ?? "number"
  if ("indicador" in args) {
    if (isClear(args.indicador)) patch.metric = null
    else {
      const metric = findMetric(String(args.indicador))
      if (!metric.ok) return metric
      patch.metric = metric.value.key
      unit = patch.unit = metric.value.unit
    }
  }
  if ("unidade" in args && !("indicador" in args && patch.metric)) {
    const raw = readText(args, "unidade", 20)
    const value = enumValue(raw.ok ? raw.value : null, METRIC_UNITS, METRIC_UNIT_LABEL)
    if (!value) return { ok: false, error: `Unidade inválida. Opções: ${METRIC_UNITS.map((option) => METRIC_UNIT_LABEL[option]).join(", ")}.` }
    unit = patch.unit = value
  }
  if ("cliente" in args) {
    if (isClear(args.cliente)) patch.client_id = null
    else {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return client
      patch.client_id = client.value.id
    }
  }
  for (const [key, field] of [["meta", "target_value"], ["base", "baseline_value"], ["valor_atual", "manual_value"]] as const) {
    const value = readValue(args, key, unit)
    if (!value.ok) return value
    if (value.value !== undefined) {
      if (field === "target_value" && value.value === null) return { ok: false, error: "Informe a meta." }
      patch[field] = value.value
    }
  }
  return { ok: true, value: patch }
}

async function findObjective(context: McpContext, query: string): Promise<Parsed<{ objective: Objective; keyResults: KeyResult[] }>> {
  const goals = await fetchGoals(context.supabase)
  const found = findByName(goals.objectives, query, (objective) => objective.title, (objective) => objective.id, "objetivo", (objective) =>
    `${formatShortDate(objective.starts_on, context.today)} a ${formatShortDate(objective.ends_on, context.today)}`
  )
  if (!found.ok) return found
  return { ok: true, value: { objective: found.value, keyResults: goals.keyResults.filter((row) => row.objective_id === found.value.id) } }
}

async function findKeyResult(context: McpContext, query: string): Promise<Parsed<KeyResult>> {
  const goals = await fetchGoals(context.supabase)
  return findByName(goals.keyResults, query, (row) => row.title, (row) => row.id, "resultado-chave")
}

const OBJECTIVE_ARG = { type: "string", description: "Id (de preferência) ou título do objetivo." } as const
const KEY_RESULT_ARG = { type: "string", description: "Id (de preferência) ou título do resultado-chave." } as const

/* ------------------------------------------------------------------ */
/* Ver                                                                 */
/* ------------------------------------------------------------------ */

const listGoals: Tool<McpContext> = {
  name: "metas",
  title: "Metas",
  description:
    "Objetivos e resultados-chave com o progresso, como na tela Metas: valor atual × meta (dinheiro em reais), progresso, o esperado para hoje e a situação (no ritmo, atenção, atrasada, atingida…). Por padrão, os objetivos em andamento.",
  inputSchema: {
    type: "object",
    properties: { quais: { type: "string", enum: ["em andamento", "proximos", "encerrados", "todos"], description: "Padrão: em andamento." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const [directory, goals, source] = await Promise.all([loadDirectory(supabase), fetchGoals(supabase), fetchMetricsSource(supabase)])
    const names = namesOf(directory)
    const filter = { "em andamento": "current", proximos: "upcoming", encerrados: "past", todos: null }[String(args.quais ?? "em andamento")]
    if (filter === undefined) return toolError("Use: em andamento, proximos, encerrados ou todos.")
    const views = goalsView(buildContext(source, today), goals.objectives, goals.keyResults).filter((view) => !filter || view.timing === filter)
    const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`)

    const blocks = views.map((view) =>
      section(
        bullet(
          view.objective.title,
          `${formatShortDate(view.objective.starts_on, today)} a ${formatShortDate(view.objective.ends_on, today)}`,
          names.person(view.objective.owner_id) ? `com ${names.person(view.objective.owner_id)}` : null,
          `progresso ${pct(view.progress)} (esperado ${pct(view.expected)})`,
          GOAL_STATE_LABEL[view.state],
          `id ${view.objective.id}`
        ).slice(2),
        view.keyResults.map((row) =>
          `  ${bullet(
            row.keyResult.title,
            `${formatMetric(row.current, row.unit, true)} de ${formatMetric(row.target, row.unit, true)}`,
            row.metricLabel ? `automático: ${row.metricLabel}` : "manual",
            names.client(row.keyResult.client_id),
            `progresso ${pct(row.progress)}`,
            GOAL_STATE_LABEL[row.state],
            `id ${row.keyResult.id}`
          )}`
        )
      ) ?? bullet(view.objective.title, "sem resultados-chave", `id ${view.objective.id}`)
    )
    return textResult(`${count(views.length, "objetivo", "objetivos")}.\n\n${joinSections(...blocks) || "Nenhum objetivo."}\n\nNo Boop Admin: ${origin}/metas`)
  },
}

/* ------------------------------------------------------------------ */
/* Objetivos                                                           */
/* ------------------------------------------------------------------ */

const createObjective: Tool<McpContext> = {
  name: "criar_objetivo",
  title: "Criar objetivo",
  description: "Cria um objetivo (meta) com período; sem datas, vale o trimestre atual. Depois, criar_resultado_chave para medir.",
  inputSchema: { type: "object", properties: OBJECTIVE_FIELDS, required: ["titulo"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const patch = readObjectivePatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    const quarter = periodShortcuts(context.today)[1]!
    const created = await insertObjective(context.supabase, { starts_on: quarter.starts_on, ends_on: quarter.ends_on, owner_id: context.user.id, ...patch.value })
    if (!created.ok) return toolError(created.error)
    return textResult(`Objetivo criado (id ${created.data.id}).\n${context.origin}/metas`)
  },
}

const editObjective: Tool<McpContext> = {
  name: "editar_objetivo",
  title: "Editar objetivo",
  description: "Muda um objetivo (só os campos informados): título, descrição, área, responsável e período.",
  inputSchema: { type: "object", properties: { objetivo: OBJECTIVE_ARG, ...OBJECTIVE_FIELDS }, required: ["objetivo"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "objetivo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findObjective(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readObjectivePatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchObjective(context.supabase, found.value.objective.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Objetivo "${found.value.objective.title}" salvo.\n${context.origin}/metas`)
  },
}

const deleteObjective: Tool<McpContext> = {
  name: "excluir_objetivo",
  title: "Excluir objetivo",
  description: "Exclui um objetivo e os resultados-chave dele. Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { objetivo: OBJECTIVE_ARG, confirmar: CONFIRM }, required: ["objetivo"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "objetivo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findObjective(context, query.value)
    if (!found.ok) return toolError(found.error)
    const { objective, keyResults } = found.value
    const pending = confirmFirst(args, `o objetivo "${objective.title}" (id ${objective.id})`, [
      keyResults.length > 0
        ? `Vão junto ${count(keyResults.length, "resultado-chave", "resultados-chave")}: ${keyResults.map((row) => row.title).join("; ")}.`
        : "Não tem resultados-chave.",
    ])
    if (pending) return pending
    const removed = await removeObjective(context.supabase, objective.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Objetivo "${objective.title}" excluído.`)
  },
}

/* ------------------------------------------------------------------ */
/* Resultados-chave                                                    */
/* ------------------------------------------------------------------ */

const createKeyResult: Tool<McpContext> = {
  name: "criar_resultado_chave",
  title: "Criar resultado-chave",
  description:
    "Cria um resultado-chave num objetivo: automático (pelo indicador, ex.: mrr) ou manual (com unidade e valor atual atualizado à mão). A meta vai na unidade: reais para dinheiro.",
  inputSchema: {
    type: "object",
    properties: { objetivo: OBJECTIVE_ARG, ...KEY_RESULT_FIELDS },
    required: ["objetivo", "titulo", "meta"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const query = readRequiredText(args, "objetivo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findObjective(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readKeyResultPatch(args, await loadDirectory(context.supabase), null)
    if (!patch.ok) return toolError(patch.error)
    const created = await insertKeyResult(context.supabase, { objective_id: found.value.objective.id, ...patch.value })
    if (!created.ok) return toolError(created.error)
    return textResult(`Resultado-chave criado em "${found.value.objective.title}" (id ${created.data.id}).\n${context.origin}/metas`)
  },
}

const editKeyResult: Tool<McpContext> = {
  name: "editar_resultado_chave",
  title: "Editar resultado-chave",
  description: "Muda um resultado-chave (só os campos informados): título, indicador, cliente, unidade, meta, base e o valor atual de um resultado manual.",
  inputSchema: { type: "object", properties: { resultado: KEY_RESULT_ARG, ...KEY_RESULT_FIELDS }, required: ["resultado"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "resultado", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findKeyResult(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readKeyResultPatch(args, await loadDirectory(context.supabase), found.value)
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchKeyResult(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Resultado-chave "${found.value.title}" salvo.\n${context.origin}/metas`)
  },
}

const deleteKeyResult: Tool<McpContext> = {
  name: "excluir_resultado_chave",
  title: "Excluir resultado-chave",
  description: "Exclui um resultado-chave. Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { resultado: KEY_RESULT_ARG, confirmar: CONFIRM }, required: ["resultado"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "resultado", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findKeyResult(context, query.value)
    if (!found.ok) return toolError(found.error)
    const pending = confirmFirst(args, `o resultado-chave "${found.value.title}"`, [
      `Meta: ${formatMetric(found.value.target_value, found.value.unit, true)}. O progresso do objetivo passa a contar sem ele.`,
    ])
    if (pending) return pending
    const removed = await removeKeyResult(context.supabase, found.value.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Resultado-chave "${found.value.title}" excluído.`)
  },
}

export const GOAL_TOOLS = [listGoals, createObjective, editObjective, deleteObjective, createKeyResult, editKeyResult, deleteKeyResult]
