import "server-only"

import { DEFAULT_DECISION_FILTERS, filterDecisions } from "@/features/decisions/logic"
import { insertDecision, patchDecision, removeDecision } from "@/features/decisions/mutations"
import { fetchDecisions } from "@/features/decisions/queries"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, excerpt, findByName, isClear, readBoolean, readRequiredText, readText, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import { CONFIRM, DESTRUCTIVE, EDIT, READ_ONLY, WRITE, confirmFirst, enumOptions, enumValue, limited, readLinks, readOptionalDate } from "@/features/mcp/tools/common"
import { formatShortDate } from "@/lib/dates"
import { DECISION_STATUS_LABEL, TASK_AREAS, TASK_AREA_LABEL } from "@/lib/labels"
import type { Decision } from "@/lib/types"

/*
 * Decisões pelo conector: listar, registrar, editar (inclusive revogar) e
 * excluir. As gravações passam por features/decisions/mutations.ts.
 */

type Args = Record<string, unknown>

const DECISION_FIELDS = {
  titulo: { type: "string", description: "O que foi decidido, numa frase.", maxLength: 300 },
  contexto: { type: "string", description: "Por quê, alternativas descartadas, detalhes. \"nenhum\" apaga.", maxLength: 5000 },
  data: { type: "string", description: "Dia da decisão (aaaa-mm-dd, \"hoje\" ou dd/mm). Padrão: hoje." },
  revogada: { type: "boolean", description: "true revoga a decisão; false volta a valer." },
  area: { type: "string", enum: enumOptions(TASK_AREAS, TASK_AREA_LABEL), description: "\"nenhum\" tira." },
  cliente: { type: "string", description: "Nome (ou id) do cliente. \"nenhum\" tira." },
  projeto: { type: "string", description: "Nome (ou id) do projeto. \"nenhum\" tira." },
} as const

function readDecisionPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  if ("contexto" in args) patch.context = isClear(args.contexto) ? null : args.contexto
  const date = readOptionalDate(args, "data", context.today)
  if (!date.ok) return date
  if (date.value) patch.decided_on = date.value
  if ("revogada" in args) patch.status = readBoolean(args, "revogada") ? "revoked" : "active"
  if ("area" in args) {
    const raw = readText(args, "area", 40)
    const area = isClear(args.area) ? null : enumValue(raw.ok ? raw.value : null, TASK_AREAS, TASK_AREA_LABEL)
    if (area === undefined) return { ok: false, error: `Área inválida. Opções: ${TASK_AREAS.map((value) => TASK_AREA_LABEL[value]).join(", ")}.` }
    patch.area = area
  }
  const links = readLinks(args, directory)
  if (!links.ok) return links
  return { ok: true, value: { ...patch, ...links.value } }
}

function findDecision(decisions: Decision[], query: string): Parsed<Decision> {
  return findByName(decisions, query, (decision) => decision.title, (decision) => decision.id, "decisão")
}

const listDecisions: Tool<McpContext> = {
  name: "decisoes",
  title: "Decisões",
  description: "Decisões registradas, a mais recente primeiro: data, situação (em vigor ou revogada), área, cliente, projeto e contexto. Por padrão, só as em vigor.",
  inputSchema: {
    type: "object",
    properties: {
      texto: { type: "string", description: "Trecho do título ou do contexto." },
      incluir_revogadas: { type: "boolean" },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readText(args, "texto", 120)
    if (!query.ok) return toolError(query.error)
    const [directory, decisions] = await Promise.all([loadDirectory(supabase), fetchDecisions(supabase)])
    const names = namesOf(directory)
    const shown = filterDecisions(decisions, {
      ...DEFAULT_DECISION_FILTERS,
      status: readBoolean(args, "incluir_revogadas") ? "all" : "active",
      query: query.value ?? "",
    })
    const lines = shown.map((decision) =>
      bullet(
        formatShortDate(decision.decided_on, today),
        decision.title,
        DECISION_STATUS_LABEL[decision.status],
        decision.area ? TASK_AREA_LABEL[decision.area] : null,
        names.client(decision.client_id),
        names.project(decision.project_id) ? `projeto ${names.project(decision.project_id)}` : null,
        decision.context ? `contexto: "${excerpt(decision.context, 200)}"` : null,
        `id ${decision.id}`
      )
    )
    return textResult(`${lines.length > 0 ? limited(lines).join("\n") : "Nenhuma decisão encontrada."}\n\nNo Boop Admin: ${origin}/decisoes`)
  },
}

const createDecision: Tool<McpContext> = {
  name: "registrar_decisao",
  title: "Registrar decisão",
  description: "Registra uma decisão (o que foi decidido, com contexto opcional, área, cliente e projeto). A data padrão é hoje.",
  inputSchema: { type: "object", properties: DECISION_FIELDS, required: ["titulo"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const directory = await loadDirectory(context.supabase)
    const patch = readDecisionPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const created = await insertDecision(context.supabase, { decided_on: context.today, ...patch.value })
    if (!created.ok) return toolError(created.error)
    return textResult(`Decisão registrada · id ${created.data.id}\n${context.origin}/decisoes`)
  },
}

const editDecision: Tool<McpContext> = {
  name: "editar_decisao",
  title: "Editar decisão",
  description: "Muda uma decisão (só os campos informados). Para revogar, revogada: true.",
  inputSchema: {
    type: "object",
    properties: { decisao: { type: "string", description: "Id (de preferência) ou título da decisão." }, ...DECISION_FIELDS },
    required: ["decisao"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "decisao", 300)
    if (!query.ok) return toolError(query.error)
    const [directory, decisions] = await Promise.all([loadDirectory(context.supabase), fetchDecisions(context.supabase)])
    const found = findDecision(decisions, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readDecisionPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchDecision(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Decisão "${excerpt(found.value.title, 120)}" salva.\n${context.origin}/decisoes`)
  },
}

const deleteDecision: Tool<McpContext> = {
  name: "excluir_decisao",
  title: "Excluir decisão",
  description:
    "Exclui uma decisão (para só deixar de valer, prefira editar_decisao com revogada: true). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: {
    type: "object",
    properties: { decisao: { type: "string", description: "Id (de preferência) ou título da decisão." }, confirmar: CONFIRM },
    required: ["decisao"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "decisao", 300)
    if (!query.ok) return toolError(query.error)
    const found = findDecision(await fetchDecisions(context.supabase), query.value)
    if (!found.ok) return toolError(found.error)
    const decision = found.value
    const pending = confirmFirst(args, `a decisão "${excerpt(decision.title, 120)}" (id ${decision.id})`, [
      `De ${formatShortDate(decision.decided_on, context.today)}, ${DECISION_STATUS_LABEL[decision.status].toLowerCase()}.`,
      "Os comentários dela somem da tela; o histórico registra a exclusão.",
    ])
    if (pending) return pending
    const removed = await removeDecision(context.supabase, decision.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult("Decisão excluída.")
  },
}

export const DECISION_TOOLS = [listDecisions, createDecision, editDecision, deleteDecision]
