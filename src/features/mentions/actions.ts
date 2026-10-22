"use server"

import { requireUser } from "@/features/auth/session"
import { getEvents } from "@/features/calendar/queries"
import { getClients } from "@/features/clients/queries"
import { publishLabel } from "@/features/content/logic"
import { getPostsForSearch, type PostSearchRow } from "@/features/content/queries"
import { meetingsOverview } from "@/features/meetings/logic"
import { getMeetingRecords } from "@/features/meetings/queries"
import { mentionLabel, type MentionOption } from "@/features/mentions/logic"
import { getPortalPosts } from "@/features/portal/content-queries"
import { getPortalProjects } from "@/features/portal/project-queries"
import { getPortalUser } from "@/features/portal/session"
import { searchEverything } from "@/features/search/actions"
import { formatShortDate, todayKey } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_STAGE_LABEL, PROJECT_STATUS_LABEL } from "@/lib/labels"
import { includesText } from "@/lib/text"
import { isUuid } from "@/lib/utils"

/*
 * Busca das menções (o "@" ou a "/" no campo de escrever). Na equipe: posts
 * e reuniões primeiro (os do cliente da conversa na frente), depois tarefas,
 * projetos, ideias, financeiro, comercial, processos e clientes, pela mesma
 * busca do Ctrl/⌘ + K. No portal: só os posts e projetos do cliente, pelas
 * funções `portal_*` (o banco confere a conta).
 */

const QUERY_MAX = 40
const POSTS_MAX = 6
const MEETINGS_MAX = 4

function cleanQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, QUERY_MAX) : ""
}

/** Posts que batem com a busca (título, formato ou etapa); vazia, os em andamento mais perto de sair. */
function matchPosts(posts: readonly PostSearchRow[], query: string, clientId: string | null): PostSearchRow[] {
  const found = query
    ? posts.filter(
        (post) =>
          includesText(post.title, query) ||
          includesText(CONTENT_FORMAT_LABEL[post.format], query) ||
          includesText(CONTENT_STAGE_LABEL[post.stage], query)
      )
    : posts.filter((post) => post.stage !== "published" && (!clientId || post.client_id === clientId))
  return found
    .map((post, index) => ({ post, index }))
    .sort(
      (a, b) =>
        Number(b.post.client_id === clientId) - Number(a.post.client_id === clientId) ||
        Number(includesText(b.post.title, query)) - Number(includesText(a.post.title, query)) ||
        Number(a.post.stage === "published") - Number(b.post.stage === "published") ||
        a.index - b.index
    )
    .slice(0, POSTS_MAX)
    .map(({ post }) => post)
}

export async function searchMentions(rawQuery: string, rawClientId?: string | null): Promise<MentionOption[]> {
  await requireUser()
  const query = cleanQuery(rawQuery)
  const clientId = isUuid(rawClientId) ? rawClientId : null
  const today = todayKey()

  const [posts, clients, rest] = await Promise.all([
    getPostsForSearch(),
    getClients(),
    query.length >= 2 ? searchEverything(query) : null,
  ])
  const clientName = new Map(clients.map((client) => [client.id, client.name]))

  const postOptions: MentionOption[] = matchPosts(posts, query, clientId).map((post) => ({
    kind: "post",
    id: post.id,
    label: mentionLabel(post.title),
    group: "Posts",
    detail: [
      clientId && post.client_id === clientId ? null : clientName.get(post.client_id),
      CONTENT_FORMAT_LABEL[post.format],
      CONTENT_STAGE_LABEL[post.stage],
      publishLabel(post, today),
    ]
      .filter(Boolean)
      .join(" · "),
  }))

  // Reuniões: com busca, as da busca geral; sem, as próximas (as do cliente na frente).
  let meetingOptions: MentionOption[]
  if (rest) {
    meetingOptions = rest.meetings.slice(0, MEETINGS_MAX).map((meeting) => ({
      kind: meeting.recordId ? "meeting" : "event",
      id: meeting.recordId ?? `${meeting.eventId}.${meeting.date}`,
      label: mentionLabel(`${meeting.title} (${formatShortDate(meeting.date, today)})`),
      group: "Reuniões",
      detail: meeting.detail,
    }))
  } else {
    const [events, { records }] = await Promise.all([getEvents(), getMeetingRecords()])
    const { upcoming } = meetingsOverview(events, records, today, { horizonDays: 14, lookbackDays: 0 })
    meetingOptions = upcoming
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => Number(b.entry.event.client_id === clientId && clientId !== null) - Number(a.entry.event.client_id === clientId && clientId !== null) || a.index - b.index)
      .slice(0, MEETINGS_MAX)
      .map(({ entry }) => ({
        kind: entry.record ? "meeting" : "event",
        id: entry.record?.id ?? `${entry.event.id}.${entry.date}`,
        label: mentionLabel(`${entry.event.title} (${formatShortDate(entry.date, today)})`),
        group: "Reuniões",
        detail: [entry.startTime, entry.event.client_id ? clientName.get(entry.event.client_id) : null].filter(Boolean).join(" · ") || null,
      }))
  }

  if (!rest) return [...postOptions, ...meetingOptions]

  return [
    ...postOptions,
    ...meetingOptions,
    ...rest.tasks.slice(0, 4).map<MentionOption>((task) => ({
      kind: "task",
      id: task.id,
      label: mentionLabel(task.title),
      group: "Tarefas",
      detail: [task.client_id ? clientName.get(task.client_id) : null, task.status === "done" ? "Concluída" : task.due_date ? `Prazo ${formatShortDate(task.due_date, today)}` : null]
        .filter(Boolean)
        .join(" · ") || null,
    })),
    ...rest.projects.slice(0, 3).map<MentionOption>((project) => ({
      kind: "project",
      id: project.id,
      label: mentionLabel(project.name),
      group: "Projetos",
      detail: project.detail,
    })),
    ...rest.ideas.slice(0, 3).flatMap<MentionOption>((idea) => {
      const clientParam = new URL(idea.href, "https://boop.local").searchParams.get("cliente")
      return isUuid(clientParam)
        ? [{ kind: "idea", id: `${clientParam}.${idea.id}`, label: mentionLabel(idea.title), group: "Ideias", detail: idea.detail || null }]
        : []
    }),
    ...rest.finance.slice(0, 3).map<MentionOption>((item) => {
      const month = new URL(item.href, "https://boop.local").searchParams.get("mes")
      return { kind: "finance", id: month ?? "atual", label: mentionLabel(item.description), group: "Financeiro", detail: item.detail }
    }),
    ...rest.deals.slice(0, 3).map<MentionOption>((deal) => ({
      kind: "deal",
      id: deal.id,
      label: mentionLabel(deal.title),
      group: "Comercial",
      detail: deal.detail || null,
    })),
    ...rest.docs.slice(0, 3).map<MentionOption>((doc) => ({
      kind: "doc",
      id: doc.id,
      label: mentionLabel(doc.title),
      group: "Processos",
      detail: doc.detail,
    })),
    ...rest.clients.slice(0, 3).map<MentionOption>((client) => ({
      kind: "client",
      id: client.id,
      label: mentionLabel(client.name),
      group: "Clientes",
      detail: client.active ? null : "Inativo",
    })),
  ]
}

/** Portal: posts e projetos do cliente que a conta acompanha. */
export async function searchPortalMentions(rawClientId: string, rawQuery: string): Promise<MentionOption[]> {
  const user = await getPortalUser()
  if (!user || !isUuid(rawClientId) || !user.clients.some((client) => client.id === rawClientId)) return []
  const query = cleanQuery(rawQuery)
  const today = todayKey()
  const [posts, projects] = await Promise.all([getPortalPosts(rawClientId), getPortalProjects(rawClientId)])

  const postOptions = posts
    .filter((post) =>
      query
        ? includesText(post.title, query) || includesText(CONTENT_FORMAT_LABEL[post.format], query)
        : post.stage !== "published"
    )
    .slice(0, POSTS_MAX)
    .map<MentionOption>((post) => ({
      kind: "post",
      id: post.id,
      label: mentionLabel(post.title),
      group: "Posts",
      detail: [CONTENT_FORMAT_LABEL[post.format], post.publish_on ? formatShortDate(post.publish_on, today) : null].filter(Boolean).join(" · "),
    }))
  const projectOptions = projects
    .filter((project) => (query ? includesText(project.name, query) : project.status !== "done"))
    .slice(0, 4)
    .map<MentionOption>((project) => ({
      kind: "project",
      id: project.id,
      label: mentionLabel(project.name),
      group: "Projetos",
      detail: PROJECT_STATUS_LABEL[project.status],
    }))
  return [...postOptions, ...projectOptions]
}
