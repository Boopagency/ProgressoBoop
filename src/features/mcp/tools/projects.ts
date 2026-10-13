import "server-only"

import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, findByName, isClear, joinSections, readBoolean, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import {
  CONFIRM,
  DESTRUCTIVE,
  EDIT,
  READ_ONLY,
  WRITE,
  approvalLabel,
  confirmFirst,
  enumOptions,
  enumValue,
  findClient,
  findPerson,
  findProject,
  readOptionalDate,
  taskLine,
} from "@/features/mcp/tools/common"
import { isOpenProject, projectStats, projectTiming } from "@/features/projects/logic"
import { insertProject, patchProject, removeProject } from "@/features/projects/mutations"
import { PROJECT_TEMPLATES, templateLabel } from "@/features/projects/templates"
import { compareCompleted, compareTasks, isDone } from "@/features/tasks/logic"
import { fetchTasks } from "@/features/tasks/queries"
import { addDaysToKey, formatShortDate } from "@/lib/dates"
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/labels"
import { foldText } from "@/lib/text"
import type { Project, Task } from "@/lib/types"

/*
 * Clientes e projetos pelo conector: ver, criar (com modelo), editar, mudar
 * status e excluir. As gravações passam por features/projects/mutations.ts,
 * as mesmas das Server Actions.
 */

type Args = Record<string, unknown>

const PROJECT_FIELDS = {
  nome: { type: "string", description: "Nome do projeto.", maxLength: 200 },
  cliente: { type: "string", description: "Nome (ou id) do cliente. \"nenhum\" = projeto interno." },
  responsavel: { type: "string", description: "Pessoa da equipe responsável (\"eu\" = você). \"nenhum\" tira." },
  status: { type: "string", enum: enumOptions(PROJECT_STATUSES, PROJECT_STATUS_LABEL) },
  descricao: { type: "string", description: "Objetivo e escopo. \"nenhum\" apaga.", maxLength: 5000 },
  comeca_em: { type: "string", description: "Começo: aaaa-mm-dd, \"hoje\" ou dd/mm." },
  prazo: { type: "string", description: "Prazo: aaaa-mm-dd ou dd/mm. \"nenhum\" tira." },
  em_foco: { type: "boolean", description: "Fixado em foco na tela Hoje e na weekly." },
} as const

const FIELD_LABEL: Record<string, string> = {
  name: "nome",
  client_id: "cliente",
  owner_id: "responsável",
  status: "status",
  description: "descrição",
  starts_on: "começo",
  due_on: "prazo",
  pinned: "em foco",
}

function readProjectPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("nome" in args) patch.name = args.nome
  if ("descricao" in args) patch.description = isClear(args.descricao) ? null : args.descricao
  if ("em_foco" in args) patch.pinned = readBoolean(args, "em_foco")
  if ("cliente" in args) {
    if (isClear(args.cliente)) patch.client_id = null
    else {
      const found = findClient(directory, String(args.cliente))
      if (!found.ok) return found
      patch.client_id = found.value.id
    }
  }
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) patch.owner_id = null
    else {
      const found = findPerson(directory, String(args.responsavel), context.user.id)
      if (!found.ok) return found
      patch.owner_id = found.value.id
    }
  }
  if ("status" in args) {
    const raw = readText(args, "status", 40)
    const status = enumValue(raw.ok ? raw.value : null, PROJECT_STATUSES, PROJECT_STATUS_LABEL)
    if (!status) return { ok: false, error: `Status inválido. Opções: ${PROJECT_STATUSES.map((value) => PROJECT_STATUS_LABEL[value]).join(", ")}.` }
    patch.status = status
  }
  const starts = readOptionalDate(args, "comeca_em", context.today)
  if (!starts.ok) return starts
  if (starts.value) patch.starts_on = starts.value
  const due = readOptionalDate(args, "prazo", context.today)
  if (!due.ok) return due
  if (due.value !== undefined) patch.due_on = due.value
  return { ok: true, value: patch }
}

function projectLine(project: Project, tasks: Task[], directory: Directory, context: McpContext): string {
  const names = namesOf(directory)
  const stats = projectStats(project.id, tasks, context.today)
  return bullet(
    project.name,
    names.client(project.client_id) ?? "Interno",
    PROJECT_STATUS_LABEL[project.status],
    project.pinned && isOpenProject(project) ? "em foco" : null,
    stats.total > 0 ? `${stats.percent}% (${stats.done} de ${stats.total} tarefas)` : "sem tarefas",
    stats.overdue > 0 ? count(stats.overdue, "atrasada", "atrasadas") : null,
    projectTiming(project, context.today).label,
    names.person(project.owner_id) ? `responsável ${names.person(project.owner_id)}` : null,
    `id ${project.id}`,
    `${context.origin}/projetos/${project.id}`
  )
}

/* ------------------------------------------------------------------ */
/* Ver                                                                 */
/* ------------------------------------------------------------------ */

const clientsAndProjects: Tool<McpContext> = {
  name: "clientes_e_projetos",
  title: "Clientes e projetos",
  description:
    "Clientes ativos (responsável, frentes, tarefas abertas e atrasadas) e projetos em aberto (cliente ou interno, status, progresso pelas tarefas, prazo, responsável, em foco). Com `cliente`, mostra só aquele cliente e todos os projetos dele.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só ele." },
      incluir_inativos: { type: "boolean", description: "Incluir clientes inativos e projetos concluídos ou cancelados." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const everything = readBoolean(args, "incluir_inativos")

    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const names = namesOf(directory)

    let clients = directory.clients.filter((client) => everything || client.active)
    let projects = directory.projects.filter((project) => everything || isOpenProject(project))
    if (clientArg.value) {
      const found = findClient(directory, clientArg.value)
      if (!found.ok) return toolError(found.error)
      clients = [found.value]
      projects = directory.projects.filter((project) => project.client_id === found.value.id)
    }

    const openTasks = tasks.filter((task) => !isDone(task))
    const clientLines = clients.map((client) => {
      const own = openTasks.filter((task) => task.client_id === client.id)
      const overdue = own.filter((task) => task.due_date !== null && task.due_date < today).length
      return bullet(
        client.name,
        client.active ? null : "inativo",
        names.person(client.owner_id) ? `responsável ${names.person(client.owner_id)}` : null,
        client.services.length > 0 ? client.services.join(", ") : null,
        `${count(own.length, "tarefa aberta", "tarefas abertas")}${overdue > 0 ? ` (${count(overdue, "atrasada", "atrasadas")})` : ""}`,
        `id ${client.id}`,
        `${origin}/clientes/${client.id}`
      )
    })

    const line = (project: Project) => projectLine(project, tasks, directory, context)
    const clientProjects = projects.filter((project) => project.client_id !== null)
    const internal = projects.filter((project) => project.client_id === null)
    return textResult(
      joinSections(
        section(clientArg.value ? "Cliente" : `Clientes${everything ? "" : " ativos"} (${clients.length})`, clientLines),
        section(`Projetos de clientes (${clientProjects.length})`, clientProjects.map(line)),
        clientArg.value ? null : section(`Projetos internos (${internal.length})`, internal.map(line))
      ) || "Nenhum cliente ou projeto encontrado."
    )
  },
}

const viewProject: Tool<McpContext> = {
  name: "ver_projeto",
  title: "Ver projeto",
  description:
    "Um projeto por inteiro: status, prazo, responsável, descrição, progresso e as etapas (tarefas), com o que o cliente vê no portal e as aprovações.",
  inputSchema: {
    type: "object",
    properties: { projeto: { type: "string", description: "Id (de preferência) ou nome do projeto." } },
    required: ["projeto"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "projeto", 200)
    if (!query.ok) return toolError(query.error)
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const found = findProject(directory, query.value)
    if (!found.ok) return toolError(found.error)
    const project = found.value
    const names = namesOf(directory)
    const own = tasks.filter((task) => task.project_id === project.id)

    const step = (task: Task) =>
      [
        taskLine(task, names, today),
        task.client_visible ? "cliente vê" : null,
        approvalLabel(task),
      ]
        .filter(Boolean)
        .join(" · ")

    return textResult(
      joinSections(
        `Projeto "${project.name}"`,
        [
          projectLine(project, tasks, directory, context),
          `- Começo ${formatShortDate(project.starts_on, today)}${project.due_on ? ` · prazo ${formatShortDate(project.due_on, today)} (${project.due_on})` : ""}`,
          templateLabel(project.template) ? `- Modelo: ${templateLabel(project.template)}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        project.description ? `Descrição:\n${project.description}` : null,
        section(`Em aberto (${own.filter((task) => !isDone(task)).length})`, own.filter((task) => !isDone(task)).sort(compareTasks).map(step)),
        section(`Concluídas (${own.filter(isDone).length})`, own.filter(isDone).sort(compareCompleted).map(step))
      ) + `\n\n${origin}/projetos/${project.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Criar, editar                                                       */
/* ------------------------------------------------------------------ */

const TEMPLATE_OPTIONS = PROJECT_TEMPLATES.map((template) => `${template.key} (${template.name})`).join(", ")

const createProject: Tool<McpContext> = {
  name: "criar_projeto",
  title: "Criar projeto",
  description: `Cria um projeto, com as tarefas iniciais de um modelo (${TEMPLATE_OPTIONS}), de outro projeto ou do checklist de um processo. As tarefas ficam com o responsável (ou com você) e com o cliente do projeto. Com modelo e sem prazo, o prazo vem da duração do modelo.`,
  inputSchema: {
    type: "object",
    properties: {
      ...PROJECT_FIELDS,
      modelo: { type: "string", description: "Chave ou nome do modelo." },
      copiar_de_projeto: { type: "string", description: "Nome (ou id) de um projeto para copiar as tarefas." },
      copiar_de_processo: { type: "string", description: "Título (ou id) de um processo cujo checklist vira as tarefas." },
    },
    required: ["nome"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const directory = await loadDirectory(supabase)
    const patch = readProjectPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const input: Record<string, unknown> = { starts_on: today, ...patch.value }

    let source: Record<string, unknown> = { type: "blank" }
    const sources = ["modelo", "copiar_de_projeto", "copiar_de_processo"].filter((key) => key in args && !isClear(args[key]))
    if (sources.length > 1) return toolError("Use só um ponto de partida: modelo, copiar_de_projeto ou copiar_de_processo.")
    if (sources[0] === "modelo") {
      const found = findByName(PROJECT_TEMPLATES, String(args.modelo), (template) => template.name, (template) => template.key, "modelo")
      const template = PROJECT_TEMPLATES.find((item) => item.key === foldText(String(args.modelo))) ?? (found.ok ? found.value : null)
      if (!template) return toolError(`Modelo não encontrado. Opções: ${TEMPLATE_OPTIONS}.`)
      source = { type: "template", key: template.key }
      if (!("prazo" in args)) input.due_on = addDaysToKey(input.starts_on as string, template.durationDays)
    } else if (sources[0] === "copiar_de_projeto") {
      const found = findProject(directory, String(args.copiar_de_projeto))
      if (!found.ok) return toolError(found.error)
      source = { type: "project", id: found.value.id }
    } else if (sources[0] === "copiar_de_processo") {
      const { data: docs, error } = await supabase.from("docs").select("id, title").order("title")
      if (error) return toolError("Não foi possível ler os processos.")
      const found = findByName(docs, String(args.copiar_de_processo), (doc) => doc.title, (doc) => doc.id, "processo")
      if (!found.ok) return toolError(found.error)
      source = { type: "doc", id: found.value.id }
    }

    const created = await insertProject(supabase, user.id, input, source)
    if (!created.ok) return toolError(created.error)
    return textResult(
      `Projeto "${String(input.name ?? "")}" criado com ${count(created.data.tasks, "tarefa", "tarefas")} (id ${created.data.id}).\n${origin}/projetos/${created.data.id}`
    )
  },
}

const editProject: Tool<McpContext> = {
  name: "editar_projeto",
  title: "Editar projeto",
  description:
    "Muda um projeto (só os campos informados): nome, cliente, responsável, status (planejado, em andamento, pausado, concluído, cancelado), descrição, datas e em foco. Se o cliente muda, as tarefas do projeto que estavam com o cliente antigo passam para o novo.",
  inputSchema: {
    type: "object",
    properties: { projeto: { type: "string", description: "Id (de preferência) ou nome do projeto." }, ...PROJECT_FIELDS },
    required: ["projeto"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const { supabase, origin } = context
    const query = readRequiredText(args, "projeto", 200)
    if (!query.ok) return toolError(query.error)
    const directory = await loadDirectory(supabase)
    const found = findProject(directory, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readProjectPatch(args, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const fields = Object.keys(patch.value)
    if (fields.length === 0) return toolError("Diga o que mudar (ex.: status, prazo, responsavel).")

    const saved = await patchProject(supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(
      `Projeto "${found.value.name}" salvo (${fields.map((field) => FIELD_LABEL[field] ?? field).join(", ")}).\n${origin}/projetos/${found.value.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Excluir                                                             */
/* ------------------------------------------------------------------ */

const deleteProject: Tool<McpContext> = {
  name: "excluir_projeto",
  title: "Excluir projeto",
  description:
    "Exclui um projeto. As tarefas continuam, sem projeto, a não ser com excluir_tarefas: true. Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: {
    type: "object",
    properties: {
      projeto: { type: "string", description: "Id (de preferência) ou nome do projeto." },
      excluir_tarefas: { type: "boolean", description: "Excluir também as tarefas do projeto." },
      confirmar: CONFIRM,
    },
    required: ["projeto"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const { supabase } = context
    const query = readRequiredText(args, "projeto", 200)
    if (!query.ok) return toolError(query.error)
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const found = findProject(directory, query.value)
    if (!found.ok) return toolError(found.error)
    const project = found.value
    const withTasks = readBoolean(args, "excluir_tarefas")
    const own = tasks.filter((task) => task.project_id === project.id)

    const pending = confirmFirst(args, `o projeto "${project.name}" (id ${project.id})`, [
      own.length === 0
        ? "O projeto não tem tarefas."
        : withTasks
          ? `${count(own.length, "tarefa vai junto", "tarefas vão junto")} (${count(own.filter((task) => !isDone(task)).length, "aberta", "abertas")}).`
          : `${count(own.length, "tarefa continua", "tarefas continuam")}, sem projeto (para apagar também, excluir_tarefas: true).`,
      "Decisões, posts, mensagens e negócios ligados ao projeto ficam, sem o projeto; os avisos do portal sobre ele somem.",
    ])
    if (pending) return pending

    const removed = await removeProject(supabase, project.id, withTasks)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Projeto "${project.name}" excluído${withTasks && own.length > 0 ? `, com ${count(own.length, "tarefa", "tarefas")}` : ""}.`)
  },
}

export const PROJECT_TOOLS = [clientsAndProjects, viewProject, createProject, editProject, deleteProject]
