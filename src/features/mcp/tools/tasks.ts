import "server-only"

import { insertComment } from "@/features/activity/mutations"
import { ACTIVITY_COLUMNS } from "@/features/activity/queries"
import { fetchDecisions } from "@/features/decisions/queries"
import type { McpContext } from "@/features/mcp/auth"
import {
  bullet,
  count,
  excerpt,
  findByName,
  fromClient,
  isClear,
  joinSections,
  readBoolean,
  readRequiredText,
  readText,
  section,
  type Parsed,
} from "@/features/mcp/logic"
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
  findProject,
  isMe,
  limited,
  readLinks,
  readOptionalDate,
  readPeople,
  taskLine,
  todayLine,
} from "@/features/mcp/tools/common"
import { insertTask, patchTask, removeTask } from "@/features/tasks/mutations"
import {
  completedWithin,
  compareTasks,
  dayContext,
  filterTasks,
  groupTasks,
  isDone,
  TASK_GROUP_LABEL,
  type DueFilter,
  type StatusFilter,
  type TaskGroupKey,
} from "@/features/tasks/logic"
import { fetchTasks } from "@/features/tasks/queries"
import { addDaysToKey, formatRange, formatShortDate, toDateKey } from "@/lib/dates"
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
} from "@/lib/labels"
import { foldText, includesText } from "@/lib/text"
import type { Task, TaskStatus } from "@/lib/types"

/*
 * Tarefas pelo conector: listar, ver, criar, editar, concluir, comentar e
 * excluir. As gravações passam por features/tasks/mutations.ts, as mesmas
 * das Server Actions; o banco cuida do histórico, dos avisos e das datas.
 */

type Args = Record<string, unknown>

const TASK_FIELDS = {
  titulo: { type: "string", description: "Título da tarefa.", maxLength: 200 },
  descricao: { type: "string", description: "Detalhes. \"nenhum\" apaga.", maxLength: 5000 },
  prazo: { type: "string", description: "Prazo: aaaa-mm-dd, \"hoje\", \"amanhã\" ou dd/mm. \"nenhum\" tira o prazo." },
  responsaveis: {
    type: "array",
    items: { type: "string" },
    description: "Nomes das pessoas da equipe (\"eu\" = você). Na edição, substitui a lista toda.",
  },
  cliente: { type: "string", description: "Nome (ou id) do cliente. \"nenhum\" tira o cliente." },
  projeto: { type: "string", description: "Nome (ou id) do projeto (leva o cliente dele). \"nenhum\" tira o projeto." },
  prioridade: { type: "string", enum: enumOptions(TASK_PRIORITIES, TASK_PRIORITY_LABEL) },
  area: { type: "string", enum: enumOptions(TASK_AREAS, TASK_AREA_LABEL), description: "Área da Boop. \"nenhum\" tira a área." },
  status: { type: "string", enum: enumOptions(TASK_STATUSES, TASK_STATUS_LABEL), description: "a fazer, fazendo ou feito." },
  cliente_ve: { type: "boolean", description: "O cliente vê esta tarefa como etapa no portal (só com cliente)." },
  precisa_aprovacao: { type: "boolean", description: "A etapa precisa da aprovação do cliente no portal (ela passa a ser vista por ele)." },
} as const

const FIELD_LABEL: Record<string, string> = {
  title: "título",
  description: "descrição",
  due_date: "prazo",
  assignee_ids: "responsáveis",
  client_id: "cliente",
  project_id: "projeto",
  priority: "prioridade",
  area: "área",
  status: "status",
  client_visible: "o cliente vê",
  client_approval_required: "precisa de aprovação",
}

const STATUS_WORDS: Record<string, TaskStatus> = { aberta: "todo", concluida: "done", concluido: "done", pronta: "done" }

function readStatus(raw: string | null): TaskStatus | null | undefined {
  if (raw === null) return null
  return enumValue(raw, TASK_STATUSES, TASK_STATUS_LABEL) ?? STATUS_WORDS[foldText(raw)]
}

/** Converte os argumentos do Claude para o formato das Server Actions (só o que veio). */
function readTaskPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  if ("descricao" in args) patch.description = isClear(args.descricao) ? null : args.descricao

  const due = readOptionalDate(args, "prazo", context.today)
  if (!due.ok) return due
  if (due.value !== undefined) patch.due_date = due.value

  const people = readPeople(args, "responsaveis", directory, context.user.id)
  if (!people.ok) return people
  if (people.value) patch.assignee_ids = people.value

  const links = readLinks(args, directory)
  if (!links.ok) return links
  Object.assign(patch, links.value)

  if ("prioridade" in args) {
    const raw = readText(args, "prioridade", 20)
    const priority = enumValue(raw.ok ? raw.value : null, TASK_PRIORITIES, TASK_PRIORITY_LABEL)
    if (!priority) return { ok: false, error: "Prioridade inválida: use alta, normal ou baixa." }
    patch.priority = priority
  }
  if ("area" in args) {
    const raw = readText(args, "area", 40)
    const area = isClear(args.area) ? null : enumValue(raw.ok ? raw.value : null, TASK_AREAS, TASK_AREA_LABEL)
    if (area === undefined) return { ok: false, error: `Área inválida. Opções: ${TASK_AREAS.map((value) => TASK_AREA_LABEL[value]).join(", ")}.` }
    patch.area = area
  }
  if ("status" in args) {
    const raw = readText(args, "status", 20)
    const status = readStatus(raw.ok ? raw.value : null)
    if (!status) return { ok: false, error: "Status inválido: use a fazer, fazendo ou feito." }
    patch.status = status
  }
  if ("cliente_ve" in args) patch.client_visible = readBoolean(args, "cliente_ve")
  if ("precisa_aprovacao" in args) patch.client_approval_required = readBoolean(args, "precisa_aprovacao")
  return { ok: true, value: patch }
}

/** Acha a tarefa pelo id ou pelo título (pelo título, as abertas primeiro). */
export function findTask(tasks: Task[], query: string): Parsed<Task> {
  const open = findByName(tasks.filter((task) => !isDone(task)), query, (task) => task.title, (task) => task.id, "tarefa aberta")
  if (open.ok) return open
  const any = findByName(tasks, query, (task) => task.title, (task) => task.id, "tarefa")
  return any.ok ? any : open
}

function approvalLabel(task: Task): string | null {
  if (!task.client_approval_required) return null
  if (task.client_approval === "approved") return "aprovada pelo cliente"
  if (task.client_approval === "changes") return "o cliente pediu ajustes"
  return isDone(task) ? "aguardando a aprovação do cliente" : "vai pedir a aprovação do cliente"
}

/* ------------------------------------------------------------------ */
/* Listar                                                              */
/* ------------------------------------------------------------------ */

const OPEN_GROUPS: TaskGroupKey[] = ["overdue", "today", "week", "later", "undated"]

const myTasks: Tool<McpContext> = {
  name: "minhas_tarefas",
  title: "Minhas tarefas",
  description:
    "Tarefas abertas de quem está conectado (ou de outra pessoa da equipe), agrupadas por prazo: atrasadas, hoje, esta semana (segunda a domingo), depois e sem prazo. Cada tarefa vem com o id, que serve para as outras ferramentas de tarefa.",
  inputSchema: {
    type: "object",
    properties: {
      pessoa: { type: "string", description: "Nome de outra pessoa da equipe. Sem isso, as suas." },
      incluir_concluidas: { type: "boolean", description: "Também listar as concluídas nos últimos 7 dias." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const personArg = readText(args, "pessoa", 120)
    if (!personArg.ok) return toolError(personArg.error)

    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    let person = { id: user.id, full_name: user.full_name }
    if (personArg.value && !isMe(personArg.value)) {
      const found = findPerson(directory, personArg.value, user.id)
      if (!found.ok) return toolError(found.error)
      person = found.value
    }

    const names = namesOf(directory)
    const days = dayContext(today)
    const own = tasks.filter((task) => task.assignee_ids.includes(person.id))
    const groups = groupTasks(own, days)
    const open = OPEN_GROUPS.reduce((total, key) => total + groups[key].length, 0)
    const recentDone = groups.done.filter((task) => task.completed_at && toDateKey(task.completed_at) >= addDaysToKey(today, -6))

    const self = person.id === user.id
    const doneThisWeek = completedWithin(own, days.week).length
    const header = `${self ? "Suas tarefas" : `Tarefas de ${person.full_name}`}: ${count(open, "aberta", "abertas")}, ${count(doneThisWeek, "concluída", "concluídas")} nesta semana (${formatRange(days.week)}). ${todayLine(context)}`
    const body = joinSections(
      ...OPEN_GROUPS.map((key) =>
        section(`${TASK_GROUP_LABEL[key]} (${groups[key].length})`, limited(groups[key].map((task) => taskLine(task, names, today, person.id))))
      ),
      readBoolean(args, "incluir_concluidas")
        ? section(`Concluídas nos últimos 7 dias (${recentDone.length})`, limited(recentDone.map((task) => taskLine(task, names, today, person.id))))
        : null
    )
    const link = `${origin}/tarefas?pessoa=${self ? "mine" : person.id}`
    return textResult(`${header}\n\n${body || "Nenhuma tarefa aberta."}\n\nNo Boop Admin: ${link}`)
  },
}

const DUE_WORDS: Record<string, DueFilter> = {
  atrasadas: "overdue",
  hoje: "today",
  semana: "week",
  "esta semana": "week",
  depois: "later",
  "sem prazo": "undated",
}
const STATUS_FILTERS: Record<string, StatusFilter> = {
  abertas: "open",
  "a fazer": "todo",
  fazendo: "doing",
  feitas: "done",
  concluidas: "done",
  todas: "all",
}

const listTasks: Tool<McpContext> = {
  name: "listar_tarefas",
  title: "Listar tarefas",
  description:
    "Lista tarefas da equipe com filtros, como a tela Tarefas: pessoa, cliente, projeto, status, prazo, área e texto. Sem filtros, todas as abertas. Até 40 por vez, com id.",
  inputSchema: {
    type: "object",
    properties: {
      pessoa: { type: "string", description: "Responsável (nome ou \"eu\")." },
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      projeto: { type: "string", description: "Nome (ou id) do projeto, ou \"nenhum\" para as sem projeto." },
      status: { type: "string", enum: Object.keys(STATUS_FILTERS), description: "Padrão: abertas." },
      prazo: { type: "string", enum: Object.keys(DUE_WORDS), description: "Faixa de prazo (semana = segunda a domingo)." },
      area: { type: "string", enum: enumOptions(TASK_AREAS, TASK_AREA_LABEL) },
      texto: { type: "string", description: "Trecho do título ou da descrição." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const names = namesOf(directory)
    const text = (key: string) => {
      const raw = readText(args, key, 200)
      return raw.ok ? raw.value : null
    }

    let person = "all"
    if (text("pessoa")) {
      const found = findPerson(directory, text("pessoa")!, user.id)
      if (!found.ok) return toolError(found.error)
      person = found.value.id
    }
    let client = "all"
    if (text("cliente")) {
      const found = findClient(directory, text("cliente")!)
      if (!found.ok) return toolError(found.error)
      client = found.value.id
    }
    let project = "all"
    if ("projeto" in args && isClear(args.projeto)) project = "none"
    else if (text("projeto")) {
      const found = findProject(directory, text("projeto")!, client === "all" ? null : client)
      if (!found.ok) return toolError(found.error)
      project = found.value.id
    }
    const status = text("status") ? STATUS_FILTERS[foldText(text("status")!)] : "open"
    if (!status) return toolError(`Status inválido. Opções: ${Object.keys(STATUS_FILTERS).join(", ")}.`)
    const due = text("prazo") ? DUE_WORDS[foldText(text("prazo")!)] : "any"
    if (!due) return toolError(`Prazo inválido. Opções: ${Object.keys(DUE_WORDS).join(", ")}.`)
    const area = text("area") ? enumValue(text("area"), TASK_AREAS, TASK_AREA_LABEL) : "all"
    if (!area) return toolError(`Área inválida. Opções: ${TASK_AREAS.map((value) => TASK_AREA_LABEL[value]).join(", ")}.`)
    const query = text("texto")

    const found = filterTasks(tasks, { person, status, area, client, project, due }, dayContext(today), user.id)
      .filter((task) => !query || includesText(task.title, query) || (task.description ? includesText(task.description, query) : false))
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareTasks(a, b))
    const lines = found.map((task) => `${taskLine(task, names, today)}${isDone(task) ? "" : ` · ${TASK_STATUS_LABEL[task.status]}`}`)
    return textResult(
      `${count(found.length, "tarefa", "tarefas")}. ${todayLine(context)}\n${limited(lines).join("\n") || "Nenhuma tarefa com esses filtros."}\n\nNo Boop Admin: ${origin}/tarefas`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Ver                                                                 */
/* ------------------------------------------------------------------ */

const viewTask: Tool<McpContext> = {
  name: "ver_tarefa",
  title: "Ver tarefa",
  description: "Uma tarefa por inteiro: descrição, responsáveis, prazo, cliente e projeto, portal e aprovação do cliente, e os comentários.",
  inputSchema: {
    type: "object",
    properties: { tarefa: { type: "string", description: "Id da tarefa (de preferência) ou o título." } },
    required: ["tarefa"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "tarefa", 200)
    if (!query.ok) return toolError(query.error)
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const found = findTask(tasks, query.value)
    if (!found.ok) return toolError(found.error)
    const task = found.value
    const names = namesOf(directory)

    const { data: comments, error } = await supabase
      .from("activity")
      .select(ACTIVITY_COLUMNS)
      .eq("entity_type", "task")
      .eq("entity_id", task.id)
      .eq("action", "comment")
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) return toolError("Não foi possível ler os comentários.")

    const facts = [
      bullet(`Status: ${TASK_STATUS_LABEL[task.status]}`, isDone(task) && task.completed_at ? `em ${formatShortDate(toDateKey(task.completed_at), today)}` : null),
      bullet(`Prazo: ${task.due_date ? `${formatShortDate(task.due_date, today)} (${task.due_date})` : "sem prazo"}`),
      bullet(`Responsáveis: ${task.assignee_ids.map((id) => names.person(id) ?? "?").join(", ") || "ninguém"}`),
      bullet(`Prioridade: ${TASK_PRIORITY_LABEL[task.priority]}`, task.area ? `área ${TASK_AREA_LABEL[task.area]}` : null),
      bullet(`Cliente: ${names.client(task.client_id) ?? "nenhum"}`, names.project(task.project_id) ? `projeto ${names.project(task.project_id)}` : null),
      task.client_id
        ? bullet(task.client_visible ? "O cliente vê no portal" : "O cliente não vê", approvalLabel(task))
        : null,
      task.client_approval_note ? `- Nota do cliente: ${fromClient(task.client_approval_note, 500)}` : null,
    ].filter((line): line is string => line !== null)

    const commentLines = comments.map((row) =>
      bullet(formatShortDate(toDateKey(row.created_at), today), names.person(row.actor_id) ?? "alguém", `"${excerpt(row.body ?? "", 400)}"`)
    )
    return textResult(
      joinSections(
        `Tarefa "${task.title}" (id ${task.id})`,
        facts.join("\n"),
        task.description ? `Descrição:\n${task.description}` : null,
        section(`Comentários (${comments.length})`, commentLines)
      ) + `\n\n${origin}/tarefas?tarefa=${task.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Criar, editar, concluir                                             */
/* ------------------------------------------------------------------ */

const createTask: Tool<McpContext> = {
  name: "criar_tarefa",
  title: "Criar tarefa",
  description:
    "Cria uma tarefa no Boop Admin. Só o título é obrigatório; sem responsáveis, fica com quem está conectado. Cliente, projeto e pessoas podem ir pelo nome. O projeto leva o cliente dele junto.",
  inputSchema: { type: "object", properties: TASK_FIELDS, required: ["titulo"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const title = readRequiredText(args, "titulo", 200)
    if (!title.ok) return toolError(title.error)
    const directory = await loadDirectory(supabase)
    const patch = readTaskPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const input: Record<string, unknown> = { assignee_ids: [user.id], ...patch.value }

    const created = await insertTask(supabase, input)
    if (!created.ok) return toolError(created.error)
    const names = namesOf(directory)
    const assignees = (input.assignee_ids as string[]).map((id) => names.person(id)).join(", ")
    const due = (input.due_date as string | null | undefined) ?? null
    return textResult(
      `Tarefa criada.\n${bullet(
        title.value,
        due ? formatShortDate(due, today) : "sem prazo",
        `responsáveis ${assignees}`,
        names.client((input.client_id as string | null | undefined) ?? null),
        names.project((input.project_id as string | null | undefined) ?? null),
        `id ${created.data.id}`
      )}\n${origin}/tarefas?tarefa=${created.data.id}`
    )
  },
}

const editTask: Tool<McpContext> = {
  name: "editar_tarefa",
  title: "Editar tarefa",
  description:
    "Muda uma tarefa: só os campos informados mudam (título, descrição, prazo, responsáveis, cliente, projeto, prioridade, área, status, o cliente vê, precisa de aprovação). Para concluir, há também concluir_tarefa.",
  inputSchema: {
    type: "object",
    properties: { tarefa: { type: "string", description: "Id da tarefa (de preferência) ou o título." }, ...TASK_FIELDS },
    required: ["tarefa"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const { supabase, origin } = context
    const query = readRequiredText(args, "tarefa", 200)
    if (!query.ok) return toolError(query.error)
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const found = findTask(tasks, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readTaskPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const fields = Object.keys(patch.value)
    if (fields.length === 0) return toolError("Diga o que mudar (ex.: prazo, responsaveis, status).")

    const saved = await patchTask(supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(
      `Tarefa "${found.value.title}" salva (${fields.map((field) => FIELD_LABEL[field] ?? field).join(", ")}).\n${origin}/tarefas?tarefa=${found.value.id}`
    )
  },
}

const completeTask: Tool<McpContext> = {
  name: "concluir_tarefa",
  title: "Concluir tarefa",
  description:
    "Marca uma tarefa como concluída (pelo id, que vem de minhas_tarefas, listar_tarefas ou buscar, ou pelo título). Os pedidos de ajuste ligados a ela são resolvidos junto. Para reabrir, editar_tarefa com status \"a fazer\".",
  inputSchema: {
    type: "object",
    properties: { tarefa: { type: "string", description: "Id da tarefa (de preferência) ou o título." } },
    required: ["tarefa"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const { supabase, origin } = context
    const query = readRequiredText(args, "tarefa", 200)
    if (!query.ok) return toolError(query.error)
    const found = findTask(await fetchTasks(supabase), query.value)
    if (!found.ok) return toolError(found.error)
    const task = found.value
    if (isDone(task)) return textResult(`A tarefa "${task.title}" já estava concluída.`)

    const saved = await patchTask(supabase, task.id, { status: "done" })
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Concluída: "${task.title}" (id ${task.id}).\n${origin}/tarefas?tarefa=${task.id}`)
  },
}

/* ------------------------------------------------------------------ */
/* Comentar                                                            */
/* ------------------------------------------------------------------ */

const COMMENT_TYPES = { tarefa: "task", projeto: "project", decisao: "decision" } as const

const comment: Tool<McpContext> = {
  name: "comentar",
  title: "Comentar",
  description: "Escreve um comentário, como você, no histórico de uma tarefa, de um projeto ou de uma decisão (a equipe vê no painel do item).",
  inputSchema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: Object.keys(COMMENT_TYPES), description: "Padrão: tarefa." },
      item: { type: "string", description: "Id (de preferência) ou o nome/título do item." },
      texto: { type: "string", description: "O comentário.", maxLength: 5000 },
    },
    required: ["item", "texto"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase } = context
    const typeArg = readText(args, "tipo", 20)
    const kind = foldText((typeArg.ok ? typeArg.value : null) ?? "tarefa") as keyof typeof COMMENT_TYPES
    if (!(kind in COMMENT_TYPES)) return toolError("Tipo inválido: tarefa, projeto ou decisao.")
    const query = readRequiredText(args, "item", 300)
    if (!query.ok) return toolError(query.error)

    let item: { id: string; title: string }
    if (kind === "tarefa") {
      const found = findTask(await fetchTasks(supabase), query.value)
      if (!found.ok) return toolError(found.error)
      item = found.value
    } else if (kind === "projeto") {
      const found = findProject(await loadDirectory(supabase), query.value)
      if (!found.ok) return toolError(found.error)
      item = { id: found.value.id, title: found.value.name }
    } else {
      const decisions = await fetchDecisions(supabase)
      const found = findByName(decisions, query.value, (decision) => decision.title, (decision) => decision.id, "decisão")
      if (!found.ok) return toolError(found.error)
      item = found.value
    }

    const saved = await insertComment(supabase, COMMENT_TYPES[kind], item.id, args.texto)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Comentário salvo em "${item.title}".`)
  },
}

/* ------------------------------------------------------------------ */
/* Excluir                                                             */
/* ------------------------------------------------------------------ */

const deleteTask: Tool<McpContext> = {
  name: "excluir_tarefa",
  title: "Excluir tarefa",
  description:
    "Exclui uma tarefa. Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga. Só confirme depois que a pessoa disser que quer.",
  inputSchema: {
    type: "object",
    properties: { tarefa: { type: "string", description: "Id da tarefa (de preferência) ou o título." }, confirmar: CONFIRM },
    required: ["tarefa"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const { supabase, today } = context
    const query = readRequiredText(args, "tarefa", 200)
    if (!query.ok) return toolError(query.error)
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const found = findTask(tasks, query.value)
    if (!found.ok) return toolError(found.error)
    const task = found.value
    const names = namesOf(directory)

    const pending = confirmFirst(args, `a tarefa "${task.title}" (id ${task.id})`, [
      taskLine(task, names, today).slice(2),
      "Vão junto: os responsáveis e os avisos ligados a ela.",
      "Ficam, sem a tarefa: combinados de reunião e pedidos de ajuste ligados; o histórico registra a exclusão.",
    ])
    if (pending) return pending

    const removed = await removeTask(supabase, task.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Tarefa "${task.title}" excluída.`)
  },
}

export const TASK_TOOLS = [myTasks, listTasks, viewTask, createTask, editTask, completeTask, comment, deleteTask]
