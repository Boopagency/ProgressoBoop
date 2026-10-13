import "server-only"

import { ideaHref } from "@/features/content/ideas-logic"
import { publishLabel } from "@/features/content/logic"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, excerpt, joinSections, readRequiredText, section } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, loadSearchSources, namesOf } from "@/features/mcp/queries"
import { READ_ONLY, taskLine } from "@/features/mcp/tools/common"
import { isOpenProject } from "@/features/projects/logic"
import { compareTasks, isDone } from "@/features/tasks/logic"
import { fetchTasks } from "@/features/tasks/queries"
import { formatShortDate } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_STAGE_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/labels"
import { foldText, includesText } from "@/lib/text"

/* Busca geral do conector: tudo o que a busca do app acha, com id e link. */

const GROUP_LIMIT = 6

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
      fetchTasks(supabase),
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

export const SEARCH_TOOLS = [search]
