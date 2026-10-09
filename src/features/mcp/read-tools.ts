import "server-only"

import { ideaHref } from "@/features/content/ideas-logic"
import { isLate, pendingFronts, publishLabel } from "@/features/content/logic"
import type { McpContext } from "@/features/mcp/auth"
import {
  bullet,
  count,
  dueLabel,
  excerpt,
  findByName,
  joinSections,
  readBoolean,
  readDate,
  readRequiredText,
  readText,
  section,
} from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import {
  loadDirectory,
  loadPendingRequests,
  loadPostsAround,
  loadSearchSources,
  loadTasks,
  namesOf,
  type Directory,
  type Names,
  type PostRow,
} from "@/features/mcp/queries"
import { isOpenProject, projectStats, projectTiming } from "@/features/projects/logic"
import { completedWithin, compareTasks, dayContext, groupTasks, isDone, TASK_GROUP_LABEL, type TaskGroupKey } from "@/features/tasks/logic"
import {
  addDaysToKey,
  formatLongDate,
  formatRange,
  formatShortDate,
  formatWeekdayShort,
  toDateKey,
  weekRangeOf,
} from "@/lib/dates"
import {
  CONTENT_FORMAT_LABEL,
  CONTENT_FRONT_LABEL,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_STAGE_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels"
import { foldText, includesText } from "@/lib/text"
import type { Task } from "@/lib/types"

/*
 * Ferramentas de leitura do MCP: busca geral, minhas tarefas, clientes e
 * projetos, conteúdo da semana e ajustes pendentes. Respostas em texto curto,
 * com os ids (para o Claude agir depois) e os links das telas.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

const GROUP_LIMIT = 6
const LIST_LIMIT = 40

/** "- Título · Venceu 07/10 · Alta · Velmont · Site · com Renatha · id …" */
function taskLine(task: Task, names: Names, today: string, exceptPerson?: string): string {
  const others = task.assignee_ids.filter((id) => id !== exceptPerson).map((id) => names.person(id)).filter(Boolean)
  return bullet(
    task.title,
    isDone(task)
      ? `concluída${task.completed_at ? ` em ${formatShortDate(toDateKey(task.completed_at), today)}` : ""}`
      : dueLabel(task.due_date, today),
    task.status === "doing" ? "Fazendo" : null,
    task.priority === "high" ? `prioridade ${TASK_PRIORITY_LABEL.high.toLowerCase()}` : null,
    names.client(task.client_id),
    names.project(task.project_id) ? `projeto ${names.project(task.project_id)}` : null,
    others.length > 0 ? `${exceptPerson ? "com" : "de"} ${others.join(", ")}` : null,
    `id ${task.id}`
  )
}

function limited(lines: string[], limit = LIST_LIMIT): string[] {
  return lines.length > limit ? [...lines.slice(0, limit), `- … e mais ${lines.length - limit}`] : lines
}

function todayLine(context: McpContext): string {
  return `Hoje: ${formatLongDate(context.today)} de ${context.today.slice(0, 4)}.`
}

/* ------------------------------------------------------------------ */
/* Busca geral                                                         */
/* ------------------------------------------------------------------ */

const search: Tool<McpContext> = {
  name: "buscar",
  title: "Busca geral",
  description:
    "Busca no Boop Admin, sem acento: tarefas, projetos, clientes, posts (título e legenda), ideias de conteúdo, decisões, processos e reuniões (inclusive resumo e transcrição). Devolve até 6 resultados por grupo, com id e link. Não inclui o financeiro nem o comercial.",
  inputSchema: {
    type: "object",
    properties: { texto: { type: "string", description: "O que procurar (pelo menos 2 letras).", minLength: 2, maxLength: 120 } },
    required: ["texto"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const parsed = readRequiredText(args, "texto", 120)
    if (!parsed.ok) return toolError(parsed.error)
    const query = parsed.value
    if (foldText(query).length < 2) return toolError("Use pelo menos 2 letras.")

    const { supabase, origin, today } = context
    const [directory, tasks, sources] = await Promise.all([
      loadDirectory(supabase),
      loadTasks(supabase),
      loadSearchSources(supabase, foldText(query)),
    ])
    const names = namesOf(directory)
    const has = (text: string | null | undefined) => (text ? includesText(text, query) : false)

    const taskLines = tasks
      .filter((task) => has(task.title) || has(task.description))
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareTasks(a, b))
      .slice(0, GROUP_LIMIT)
      .map((task) => `${taskLine(task, names, today)} · ${TASK_STATUS_LABEL[task.status]} · ${origin}/tarefas?tarefa=${task.id}`)

    const projectLines = directory.projects
      .filter((project) => has(project.name) || has(names.client(project.client_id)))
      .sort((a, b) => Number(isOpenProject(b)) - Number(isOpenProject(a)))
      .slice(0, GROUP_LIMIT)
      .map((project) =>
        bullet(project.name, names.client(project.client_id) ?? "Interno", PROJECT_STATUS_LABEL[project.status], `id ${project.id}`, `${origin}/projetos/${project.id}`)
      )

    const clientLines = directory.clients
      .filter((client) => has(client.name))
      .sort((a, b) => Number(b.active) - Number(a.active))
      .slice(0, GROUP_LIMIT)
      .map((client) => bullet(client.name, client.active ? null : "inativo", `id ${client.id}`, `${origin}/clientes/${client.id}`))

    const postLines = sources.posts
      .filter((post) => has(post.title) || has(post.caption))
      .sort((a, b) => Number(has(b.title)) - Number(has(a.title)) || Number(a.stage === "published") - Number(b.stage === "published"))
      .slice(0, GROUP_LIMIT)
      .map((post) =>
        bullet(
          post.title,
          names.client(post.client_id),
          CONTENT_FORMAT_LABEL[post.format],
          CONTENT_STAGE_LABEL[post.stage],
          publishLabel({ publish_on: post.publish_on, publish_time: null }, today),
          !has(post.title) && post.caption ? `legenda: "${excerpt(post.caption, 80)}"` : null,
          `id ${post.id}`,
          `${origin}/conteudo?post=${post.id}`
        )
      )

    const ideaLines = sources.ideas
      .filter((idea) => has(idea.title) || has(idea.notes))
      .sort((a, b) => Number(a.post_id !== null) - Number(b.post_id !== null))
      .slice(0, GROUP_LIMIT)
      .map((idea) =>
        bullet(idea.title, names.client(idea.client_id), idea.post_id ? "já virou post" : "livre", `id ${idea.id}`, `${origin}${ideaHref(idea)}`)
      )

    const decisionLines = sources.decisions
      .filter((decision) => has(decision.title) || has(decision.context))
      .slice(0, GROUP_LIMIT)
      .map((decision) =>
        bullet(
          decision.title,
          formatShortDate(decision.decided_on, today),
          decision.status === "revoked" ? "revogada" : "em vigor",
          `${origin}/decisoes?q=${encodeURIComponent(decision.title.slice(0, 80))}`
        )
      )

    const docLines = sources.docs
      .filter((doc) => has(doc.title) || has(doc.summary) || sources.docHits.has(doc.id))
      .sort((a, b) => Number(has(b.title)) - Number(has(a.title)))
      .slice(0, GROUP_LIMIT)
      .map((doc) => bullet(doc.title, doc.summary ? excerpt(doc.summary, 100) : null, `${origin}/processos/${doc.id}`))

    const meetingLines = sources.meetings
      .filter(
        (meeting) =>
          has(meeting.event?.title) ||
          has(names.client(meeting.event?.client_id ?? null)) ||
          has(meeting.summary) ||
          sources.meetingHits.has(meeting.id)
      )
      .slice(0, GROUP_LIMIT)
      .map((meeting) =>
        bullet(
          meeting.event?.title ?? "Reunião",
          formatShortDate(meeting.occurs_on, today),
          meeting.summary ? excerpt(meeting.summary, 100) : null,
          `${origin}/reunioes/${meeting.id}`
        )
      )

    const body = joinSections(
      section("Tarefas", taskLines),
      section("Projetos", projectLines),
      section("Clientes", clientLines),
      section("Posts", postLines),
      section("Ideias de conteúdo", ideaLines),
      section("Decisões", decisionLines),
      section("Processos", docLines),
      section("Reuniões", meetingLines)
    )
    return textResult(body ? `Resultados para "${query}":\n\n${body}` : `Nada encontrado para "${query}".`)
  },
}

/* ------------------------------------------------------------------ */
/* Minhas tarefas                                                      */
/* ------------------------------------------------------------------ */

const OPEN_GROUPS: TaskGroupKey[] = ["overdue", "today", "week", "later", "undated"]

const myTasks: Tool<McpContext> = {
  name: "minhas_tarefas",
  title: "Minhas tarefas",
  description:
    "Tarefas abertas de quem está conectado (ou de outra pessoa da equipe), agrupadas por prazo: atrasadas, hoje, esta semana (segunda a domingo), depois e sem prazo. Cada tarefa vem com o id, que serve para concluir_tarefa.",
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

    const [directory, tasks] = await Promise.all([loadDirectory(supabase), loadTasks(supabase)])
    let person = { id: user.id, full_name: user.full_name }
    if (personArg.value && !isMe(personArg.value)) {
      const found = findByName(directory.profiles, personArg.value, (profile) => profile.full_name, (profile) => profile.id, "pessoa da equipe")
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

function isMe(text: string): boolean {
  return ["eu", "mim", "minhas", "meu", "minha", "eu mesmo", "eu mesma"].includes(foldText(text.trim()))
}

/* ------------------------------------------------------------------ */
/* Clientes e projetos                                                 */
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

    const [directory, tasks] = await Promise.all([loadDirectory(supabase), loadTasks(supabase)])
    const names = namesOf(directory)

    let clients = directory.clients.filter((client) => everything || client.active)
    let projects = directory.projects.filter((project) => everything || isOpenProject(project))
    if (clientArg.value) {
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
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

    const projectLine = (project: Directory["projects"][number]) => {
      const stats = projectStats(project.id, tasks, today)
      return bullet(
        project.name,
        names.client(project.client_id) ?? "Interno",
        PROJECT_STATUS_LABEL[project.status],
        project.pinned && isOpenProject(project) ? "em foco" : null,
        stats.total > 0 ? `${stats.percent}% (${stats.done} de ${stats.total} tarefas)` : "sem tarefas",
        stats.overdue > 0 ? count(stats.overdue, "atrasada", "atrasadas") : null,
        projectTiming(project, today).label,
        names.person(project.owner_id) ? `responsável ${names.person(project.owner_id)}` : null,
        `id ${project.id}`,
        `${origin}/projetos/${project.id}`
      )
    }
    const clientProjects = projects.filter((project) => project.client_id !== null)
    const internal = projects.filter((project) => project.client_id === null)

    return textResult(
      joinSections(
        section(clientArg.value ? "Cliente" : `Clientes${everything ? "" : " ativos"} (${clients.length})`, clientLines),
        section(`Projetos de clientes (${clientProjects.length})`, clientProjects.map(projectLine)),
        clientArg.value ? null : section(`Projetos internos (${internal.length})`, internal.map(projectLine))
      ) || "Nenhum cliente ou projeto encontrado."
    )
  },
}

/* ------------------------------------------------------------------ */
/* Conteúdo da semana                                                  */
/* ------------------------------------------------------------------ */

function postLine(post: PostRow, names: Names, today: string, origin: string): string {
  const missing = pendingFronts(post).map((front) => {
    const status = post[`${front}_status` as const]
    return `${CONTENT_FRONT_LABEL[front]} ${CONTENT_FRONT_STATUS_LABEL[status].toLowerCase()}`
  })
  return bullet(
    publishLabel(post, today),
    names.client(post.client_id),
    post.title,
    CONTENT_FORMAT_LABEL[post.format],
    CONTENT_STAGE_LABEL[post.stage],
    missing.length > 0 && post.stage !== "published" ? `falta: ${missing.join(", ")}` : null,
    names.person(post.owner_id) ? `responsável ${names.person(post.owner_id)}` : null,
    `id ${post.id}`,
    `${origin}/conteudo?post=${post.id}`
  )
}

const weekContent: Tool<McpContext> = {
  name: "conteudo_da_semana",
  title: "Conteúdo da semana",
  description:
    "Posts da Central de Conteúdo na semana (segunda a domingo), dia a dia, com cliente, formato, etapa e o que falta em cada frente (copy, design, vídeo); antes, os atrasados (data passada e ainda não programados nem publicados). Por padrão, a semana atual.",
  inputSchema: {
    type: "object",
    properties: {
      data: { type: "string", description: "Qualquer dia da semana desejada (aaaa-mm-dd). Ex.: a próxima semana. Sem isso, a atual." },
      cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só os posts dele." },
      apenas_meus: { type: "boolean", description: "Só os posts em que você é responsável." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const dateArg = readDate(args, "data", today)
    if (!dateArg.ok) return toolError(dateArg.error)
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const week = weekRangeOf(dateArg.value ?? today)

    const [directory, rows] = await Promise.all([loadDirectory(supabase), loadPostsAround(supabase, week.start, week.end)])
    const names = namesOf(directory)
    let posts = rows
    if (clientArg.value) {
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
      if (!found.ok) return toolError(found.error)
      posts = posts.filter((post) => post.client_id === found.value.id)
    }
    if (readBoolean(args, "apenas_meus")) posts = posts.filter((post) => post.owner_id === user.id)

    const inWeek = posts.filter((post) => post.publish_on !== null && post.publish_on >= week.start)
    const late = posts.filter((post) => isLate(post, today) && post.publish_on! < week.start)
    const days = new Map<string, PostRow[]>()
    for (const post of inWeek) days.set(post.publish_on!, [...(days.get(post.publish_on!) ?? []), post])

    const published = inWeek.filter((post) => post.stage === "published").length
    const waiting = inWeek.filter((post) => post.stage === "client_review").length
    const header = `Conteúdo de ${formatRange(week)}: ${count(inWeek.length, "post", "posts")} (${count(published, "publicado", "publicados")}, ${waiting} aguardando o cliente). ${todayLine(context)}`
    const body = joinSections(
      section(`Atrasados (${late.length})`, limited(late.map((post) => postLine(post, names, today, origin)))),
      ...[...days.entries()].map(([day, list]) =>
        section(`${formatWeekdayShort(day)} ${formatShortDate(day, today)}${day === today ? " (hoje)" : ""}`, list.map((post) => postLine(post, names, today, origin)))
      )
    )
    return textResult(`${header}\n\n${body || "Nenhum post nesta semana."}\n\nNo Boop Admin: ${origin}/conteudo?visao=semana&data=${week.start}`)
  },
}

/* ------------------------------------------------------------------ */
/* Ajustes pendentes                                                   */
/* ------------------------------------------------------------------ */

const pendingRequests: Tool<McpContext> = {
  name: "ajustes_pendentes",
  title: "Ajustes pendentes",
  description:
    "Pedidos de ajuste dos clientes ainda não resolvidos (mensagens marcadas como pedido nos canais das Comunicações), o mais antigo primeiro: cliente, quem pediu, quando, o texto, o post e a tarefa ligada.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só os pedidos dele." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)

    const [directory, rows] = await Promise.all([loadDirectory(supabase), loadPendingRequests(supabase)])
    const names = namesOf(directory)
    let requests = rows
    if (clientArg.value) {
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
      if (!found.ok) return toolError(found.error)
      requests = requests.filter((row) => row.channel.client_id === found.value.id)
    }

    const lines = requests.map((row) =>
      bullet(
        formatShortDate(toDateKey(row.created_at), today),
        names.client(row.channel.client_id) ?? row.channel.name ?? "Canal",
        // Autor sem perfil = a conta do cliente, no portal.
        names.person(row.author_id) ?? "cliente",
        `"${excerpt(row.body, 200)}"`,
        row.post ? `post "${row.post.title}"` : null,
        row.task ? `tarefa ${TASK_STATUS_LABEL[row.task.status].toLowerCase()} (id ${row.task.id})` : "sem tarefa",
        `${origin}/comunicacoes?canal=${row.channel.id}&ver=pendentes`
      )
    )
    return textResult(
      lines.length > 0
        ? `Pedidos de ajuste pendentes (${lines.length}):\n${limited(lines).join("\n")}`
        : "Nenhum pedido de ajuste pendente."
    )
  },
}

export const READ_TOOLS = [search, myTasks, clientsAndProjects, weekContent, pendingRequests]
