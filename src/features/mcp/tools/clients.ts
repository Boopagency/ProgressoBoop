import "server-only"

import { checklistOf, clientTaskStats, currentHealth, periodLabel, periodOf, reviewStatus } from "@/features/clients/logic"
import { insertClient, insertReviewStep, writeClient, writeClientActive, writeReview, writeReviewDone } from "@/features/clients/mutations"
import { fetchClientReviews, fetchClients } from "@/features/clients/queries"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, findByName, isClear, joinSections, readBoolean, readDate, readList, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import { EDIT, READ_ONLY, WRITE, enumOptions, enumValue, findPeople, findPerson, limited, readOptionalDate, taskLine } from "@/features/mcp/tools/common"
import { isOpenProject } from "@/features/projects/logic"
import { compareTasks, isDone } from "@/features/tasks/logic"
import { fetchTasks } from "@/features/tasks/queries"
import { formatShortDate, isDateKey } from "@/lib/dates"
import { CLIENT_HEALTHS, CLIENT_HEALTH_LABEL, PROJECT_STATUS_LABEL } from "@/lib/labels"
import type { ClientDetail, DateKey } from "@/lib/types"

/*
 * Clientes pelo conector: ver a ficha, cadastrar, editar, ativar/desativar e
 * a revisão mensal (saúde, checklist, notas, concluir, próximo passo).
 * Excluir cliente fica só na tela (apaga posts e imagens do Storage). As
 * gravações passam por features/clients/mutations.ts.
 */

type Args = Record<string, unknown>

const CLIENT_FIELDS = {
  nome: { type: "string", maxLength: 80 },
  responsavel: { type: "string", description: "Pessoa da equipe responsável (\"eu\" = você). \"nenhum\" tira." },
  frentes: { type: "array", items: { type: "string" }, description: "Frentes de trabalho (ex.: Social media, Tráfego pago). Substitui a lista." },
  cliente_desde: { type: "string", description: "Data de início (aaaa-mm-dd). \"nenhum\" tira." },
  contato_nome: { type: "string" },
  contato_email: { type: "string" },
  contato_telefone: { type: "string" },
  observacoes: { type: "string", maxLength: 5000 },
  dia_da_revisao: { type: ["integer", "null"], description: "Dia do mês (1 a 28) em que a revisão mensal vence; null = sem revisão." },
} as const

/** A ficha inteira no formato da Server Action: o que não veio continua como está. */
function readClientInput(args: Args, context: McpContext, directory: Directory, current: ClientDetail | null): Parsed<Record<string, unknown>> {
  const input: Record<string, unknown> = {
    name: current?.name ?? null,
    owner_id: current?.owner_id ?? null,
    services: current?.services ?? [],
    since: current?.since ?? null,
    contact_name: current?.contact_name ?? null,
    contact_email: current?.contact_email ?? null,
    contact_phone: current?.contact_phone ?? null,
    notes: current?.notes ?? null,
    review_day: current?.review_day ?? null,
  }
  if ("nome" in args) input.name = args.nome
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) input.owner_id = null
    else {
      const person = findPerson(directory, String(args.responsavel), context.user.id)
      if (!person.ok) return person
      input.owner_id = person.value.id
    }
  }
  if ("frentes" in args) {
    const services = readList(args, "frentes")
    if (!services.ok) return services
    input.services = services.value
  }
  const since = readOptionalDate(args, "cliente_desde", context.today)
  if (!since.ok) return since
  if (since.value !== undefined) input.since = since.value
  const texts = [
    ["contato_nome", "contact_name"],
    ["contato_email", "contact_email"],
    ["contato_telefone", "contact_phone"],
    ["observacoes", "notes"],
  ] as const
  for (const [key, field] of texts) if (key in args) input[field] = isClear(args[key]) ? null : args[key]
  if ("dia_da_revisao" in args) input.review_day = args.dia_da_revisao ?? null
  return { ok: true, value: input }
}

async function findClientDetail(context: McpContext, query: string): Promise<Parsed<ClientDetail>> {
  const clients = await fetchClients(context.supabase)
  return findByName(clients, query, (client) => client.name, (client) => client.id, "cliente")
}

/** Mês da revisão: "2026-10", uma data do mês ou nada (o mês de hoje). */
function readPeriod(args: Args, today: DateKey): Parsed<DateKey> {
  const raw = readText(args, "mes", 20)
  if (!raw.ok) return raw
  if (!raw.value) return { ok: true, value: periodOf(today) }
  const key = /^\d{4}-\d{2}$/.test(raw.value) ? `${raw.value}-01` : raw.value
  return isDateKey(key) ? { ok: true, value: periodOf(key) } : { ok: false, error: "Mês inválido: use aaaa-mm (ex.: 2026-10)." }
}

/* ------------------------------------------------------------------ */
/* Ver                                                                 */
/* ------------------------------------------------------------------ */

const viewClient: Tool<McpContext> = {
  name: "ver_cliente",
  title: "Ver cliente",
  description:
    "A ficha de um cliente (responsável, frentes, contato, observações, saúde), a revisão mensal do mês (situação, checklist e notas), as tarefas abertas e os projetos.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) do cliente." } },
    required: ["cliente"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "cliente", 120)
    if (!query.ok) return toolError(query.error)
    const found = await findClientDetail(context, query.value)
    if (!found.ok) return toolError(found.error)
    const client = found.value
    const [directory, reviews, tasks] = await Promise.all([loadDirectory(supabase), fetchClientReviews(supabase, client.id), fetchTasks(supabase)])
    const names = namesOf(directory)

    const status = reviewStatus(client, reviews, today)
    const health = currentHealth(client.id, reviews)
    const stats = clientTaskStats(tasks, client.id, today)
    const open = tasks.filter((task) => task.client_id === client.id && !isDone(task)).sort(compareTasks)
    const projects = directory.projects.filter((project) => project.client_id === client.id)
    const reviewState = { done: "concluída", in_progress: "em andamento", pending: "a fazer", overdue: "atrasada", off: "sem revisão mensal" }[status.state]

    return textResult(
      joinSections(
        `Cliente "${client.name}" (id ${client.id})${client.active ? "" : " · inativo"}`,
        [
          bullet(`Responsável: ${names.person(client.owner_id) ?? "ninguém"}`, client.since ? `cliente desde ${formatShortDate(client.since, today)}` : null),
          bullet(`Frentes: ${client.services.join(", ") || "nenhuma"}`),
          bullet(`Contato: ${[client.contact_name, client.contact_email, client.contact_phone].filter(Boolean).join(" · ") || "não informado"}`),
          bullet(`Saúde: ${health ? `${CLIENT_HEALTH_LABEL[health.health]} (${periodLabel(health.period)})` : "sem avaliação"}`),
          bullet(`Tarefas: ${count(stats.open, "aberta", "abertas")}, ${count(stats.overdue, "atrasada", "atrasadas")}`),
        ].join("\n"),
        client.notes ? `Observações:\n${client.notes}` : null,
        section(
          `Revisão de ${periodLabel(status.period)}: ${reviewState}${status.due ? ` (vence ${formatShortDate(status.due, today)})` : ""}`,
          [
            ...checklistOf(status.review).map((item) => `- [${item.done ? "x" : " "}] ${item.label}`),
            status.review?.health ? `- Saúde do mês: ${CLIENT_HEALTH_LABEL[status.review.health]}` : null,
            status.review?.notes ? `- Notas: ${status.review.notes}` : null,
          ].filter((line): line is string => line !== null)
        ),
        section(`Tarefas abertas (${open.length})`, limited(open.map((task) => taskLine(task, names, today)), 20)),
        section(
          `Projetos (${projects.length})`,
          projects.map((project) =>
            bullet(project.name, PROJECT_STATUS_LABEL[project.status], isOpenProject(project) ? null : "encerrado", `id ${project.id}`)
          )
        )
      ) + `\n\n${origin}/clientes/${client.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Cadastrar e editar                                                  */
/* ------------------------------------------------------------------ */

const createClient: Tool<McpContext> = {
  name: "criar_cliente",
  title: "Cadastrar cliente",
  description: "Cadastra um cliente (ativo). Só o nome é obrigatório. O canal do cliente nas Comunicações é criado pelo banco.",
  inputSchema: { type: "object", properties: CLIENT_FIELDS, required: ["nome"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const input = readClientInput(args, context, await loadDirectory(context.supabase), null)
    if (!input.ok) return toolError(input.error)
    const created = await insertClient(context.supabase, input.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Cliente "${String(input.value.name)}" cadastrado (id ${created.data.id}).\n${context.origin}/clientes/${created.data.id}`)
  },
}

const editClient: Tool<McpContext> = {
  name: "editar_cliente",
  title: "Editar cliente",
  description: "Muda a ficha de um cliente (só os campos informados) e/ou ativa e desativa (inativos saem das listas de escolha e das revisões).",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      ...CLIENT_FIELDS,
      ativo: { type: "boolean", description: "false desativa; true reativa." },
    },
    required: ["cliente"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "cliente", 120)
    if (!query.ok) return toolError(query.error)
    const found = await findClientDetail(context, query.value)
    if (!found.ok) return toolError(found.error)
    const client = found.value
    const fields = Object.keys(args).filter((key) => key in CLIENT_FIELDS)
    if (fields.length === 0 && !("ativo" in args)) return toolError("Diga o que mudar.")

    if (fields.length > 0) {
      const input = readClientInput(args, context, await loadDirectory(context.supabase), client)
      if (!input.ok) return toolError(input.error)
      const saved = await writeClient(context.supabase, client.id, input.value)
      if (!saved.ok) return toolError(saved.error)
    }
    if ("ativo" in args) {
      const saved = await writeClientActive(context.supabase, client.id, readBoolean(args, "ativo"))
      if (!saved.ok) return toolError(saved.error)
    }
    return textResult(`Cliente "${client.name}" salvo.\n${context.origin}/clientes/${client.id}`)
  },
}

/* ------------------------------------------------------------------ */
/* Revisão mensal                                                      */
/* ------------------------------------------------------------------ */

const saveReview: Tool<McpContext> = {
  name: "salvar_revisao_mensal",
  title: "Salvar revisão mensal",
  description:
    "Revisão mensal de um cliente: saúde do mês, marcar ou desmarcar itens do checklist (pelo texto do item), notas e concluir/reabrir. A revisão do mês é criada na primeira mudança.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      mes: { type: "string", description: "Mês (aaaa-mm). Padrão: o mês de hoje." },
      saude: { type: "string", enum: enumOptions(CLIENT_HEALTHS, CLIENT_HEALTH_LABEL), description: "\"nenhum\" tira." },
      marcar: { type: "array", items: { type: "string" }, description: "Itens do checklist feitos (trecho do texto)." },
      desmarcar: { type: "array", items: { type: "string" }, description: "Itens do checklist a desmarcar." },
      notas: { type: "string", maxLength: 20000, description: "Substitui as notas da revisão. \"nenhum\" apaga." },
      concluida: { type: "boolean", description: "true conclui a revisão; false reabre." },
    },
    required: ["cliente"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "cliente", 120)
    if (!query.ok) return toolError(query.error)
    const found = await findClientDetail(context, query.value)
    if (!found.ok) return toolError(found.error)
    const client = found.value
    const period = readPeriod(args, today)
    if (!period.ok) return toolError(period.error)

    const patch: Record<string, unknown> = {}
    if ("saude" in args) {
      const raw = readText(args, "saude", 30)
      const health = isClear(args.saude) ? null : enumValue(raw.ok ? raw.value : null, CLIENT_HEALTHS, CLIENT_HEALTH_LABEL)
      if (health === undefined) return toolError(`Saúde inválida. Opções: ${CLIENT_HEALTHS.map((value) => CLIENT_HEALTH_LABEL[value]).join(", ")}.`)
      patch.health = health
    }
    if ("notas" in args) patch.notes = isClear(args.notas) ? null : args.notas
    if ("marcar" in args || "desmarcar" in args) {
      const reviews = await fetchClientReviews(supabase, client.id)
      const checklist = checklistOf(reviews.find((review) => review.period === period.value) ?? null)
      for (const [key, done] of [["marcar", true], ["desmarcar", false]] as const) {
        const items = readList(args, key)
        if (!items.ok) return toolError(items.error)
        for (const text of items.value) {
          const item = findByName(checklist, text, (entry) => entry.label, (entry) => entry.key, "item do checklist")
          if (!item.ok) return toolError(item.error)
          item.value.done = done
        }
      }
      patch.checklist = checklist
    }
    if (Object.keys(patch).length === 0 && !("concluida" in args)) return toolError("Diga o que mudar na revisão.")

    if (Object.keys(patch).length > 0) {
      const saved = await writeReview(supabase, client.id, period.value, patch)
      if (!saved.ok) return toolError(saved.error)
    }
    if ("concluida" in args) {
      const saved = await writeReviewDone(supabase, client.id, period.value, readBoolean(args, "concluida"))
      if (!saved.ok) return toolError(saved.error)
    }
    return textResult(`Revisão de ${periodLabel(period.value)} de ${client.name} salva.\n${origin}/clientes/${client.id}`)
  },
}

const reviewStep: Tool<McpContext> = {
  name: "proximo_passo_da_revisao",
  title: "Próximo passo da revisão",
  description: "Registra um próximo passo da revisão mensal: vira tarefa do cliente (área Clientes), ligada à revisão do mês.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      mes: { type: "string", description: "Mês (aaaa-mm). Padrão: o mês de hoje." },
      titulo: { type: "string", maxLength: 200 },
      responsaveis: { type: "array", items: { type: "string" }, description: "Padrão: você." },
      prazo: { type: "string", description: "aaaa-mm-dd ou dd/mm." },
    },
    required: ["cliente", "titulo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const query = readRequiredText(args, "cliente", 120)
    if (!query.ok) return toolError(query.error)
    const found = await findClientDetail(context, query.value)
    if (!found.ok) return toolError(found.error)
    const period = readPeriod(args, today)
    if (!period.ok) return toolError(period.error)
    const due = readDate(args, "prazo", today)
    if (!due.ok) return toolError(due.error)
    const names = readList(args, "responsaveis")
    if (!names.ok) return toolError(names.error)
    const people = findPeople(await loadDirectory(supabase), names.value.length > 0 ? names.value : ["eu"], user.id)
    if (!people.ok) return toolError(people.error)

    const created = await insertReviewStep(supabase, found.value.id, period.value, {
      title: typeof args.titulo === "string" ? args.titulo : "",
      assignee_ids: people.value,
      due_date: due.value,
    })
    if (!created.ok) return toolError(created.error)
    return textResult(`Próximo passo criado como tarefa (id ${created.data.id}).\n${origin}/tarefas?tarefa=${created.data.id}`)
  },
}

export const CLIENT_TOOLS = [viewClient, createClient, editClient, saveReview, reviewStep]
