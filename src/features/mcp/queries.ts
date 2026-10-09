import "server-only"

import type { McpSupabase } from "@/features/mcp/auth"
import { PROJECT_COLUMNS } from "@/features/projects/columns"
import { loadError } from "@/lib/supabase/errors"
import type { Channel, ContentFormat, ContentPost, DateKey, Project, Task } from "@/lib/types"

/*
 * Leituras das ferramentas do MCP. Recebem o cliente do Supabase com o token
 * da pessoa (não o dos cookies), então valem as mesmas políticas de RLS das
 * telas. Nada daqui lê o financeiro.
 */

export interface Person {
  id: string
  full_name: string
}

export interface ClientEntry {
  id: string
  name: string
  active: boolean
  owner_id: string | null
  services: string[]
}

/** Equipe, clientes e projetos: os nomes de tudo o que as ferramentas mostram. */
export interface Directory {
  profiles: Person[]
  clients: ClientEntry[]
  projects: Project[]
}

export async function loadDirectory(supabase: McpSupabase): Promise<Directory> {
  const [profiles, clients, projects] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("created_at"),
    supabase.from("clients").select("id, name, active, owner_id, services").order("name"),
    supabase.from("projects").select(PROJECT_COLUMNS).order("starts_on"),
  ])
  if (profiles.error) throw loadError(profiles.error, "a equipe")
  if (clients.error) throw loadError(clients.error, "os clientes")
  if (projects.error) throw loadError(projects.error, "os projetos")
  return { profiles: profiles.data, clients: clients.data, projects: projects.data }
}

/** Nomes por id, para montar as linhas. */
export interface Names {
  person: (id: string | null) => string | null
  client: (id: string | null) => string | null
  project: (id: string | null) => string | null
}

export function namesOf(directory: Directory): Names {
  const people = new Map(directory.profiles.map((profile) => [profile.id, profile.full_name]))
  const clients = new Map(directory.clients.map((client) => [client.id, client.name]))
  const projects = new Map(directory.projects.map((project) => [project.id, project.name]))
  return {
    person: (id) => (id ? (people.get(id) ?? null) : null),
    client: (id) => (id ? (clients.get(id) ?? null) : null),
    project: (id) => (id ? (projects.get(id) ?? null) : null),
  }
}

const TASK_COLUMNS =
  "id, title, description, client_id, project_id, meeting_id, doc_id, client_review_id, communication_id, content_post_id, area, status, priority, due_date, completed_at, created_by, created_at, updated_at, task_assignees(profile_id)"

/** Todas as tarefas (o volume é pequeno, como na tela Tarefas). */
export async function loadTasks(supabase: McpSupabase): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select(TASK_COLUMNS).order("due_date", { nullsFirst: false }).order("created_at")
  if (error) throw loadError(error, "as tarefas")
  return data.map(({ task_assignees, ...task }) => ({
    ...task,
    assignee_ids: task_assignees.map((assignee) => assignee.profile_id),
  }))
}

export type PostRow = Pick<
  ContentPost,
  | "id"
  | "client_id"
  | "title"
  | "format"
  | "networks"
  | "publish_on"
  | "publish_time"
  | "stage"
  | "copy_status"
  | "design_status"
  | "video_status"
  | "owner_id"
  | "published_at"
>

const POST_COLUMNS =
  "id, client_id, title, format, networks, publish_on, publish_time, stage, copy_status, design_status, video_status, owner_id, published_at"

/** Posts com data no período e os atrasados (com data antes dele e ainda não publicados). */
export async function loadPostsAround(supabase: McpSupabase, start: DateKey, end: DateKey): Promise<PostRow[]> {
  const { data, error } = await supabase
    .from("content_posts")
    .select(POST_COLUMNS)
    .or(`and(publish_on.gte.${start},publish_on.lte.${end}),and(publish_on.lt.${start},stage.neq.published)`)
    .order("publish_on")
    .order("publish_time", { nullsFirst: true })
    .limit(500)
  if (error) throw loadError(error, "os posts")
  return data
}

export interface PendingRow {
  id: string
  body: string
  created_at: string
  author_id: string | null
  task_id: string | null
  channel: Pick<Channel, "id" | "kind" | "client_id" | "name" | "archived">
  post: { id: string; title: string } | null
  task: { id: string; status: Task["status"] } | null
}

/** Pedidos de ajuste ainda não resolvidos dos canais ativos, o mais antigo primeiro. */
export async function loadPendingRequests(supabase: McpSupabase): Promise<PendingRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, body, created_at, author_id, task_id, channel:channels(id, kind, client_id, name, archived), post:content_posts(id, title), task:tasks(id, status)"
    )
    .eq("kind", "change_request")
    .is("resolved_at", null)
    .order("created_at")
    .limit(200)
  if (error) throw loadError(error, "os pedidos de ajuste")
  return data.filter((row) => !row.channel.archived)
}

/** Canais que a pessoa enxerga (o RLS filtra), com os participantes. */
export async function loadChannels(supabase: McpSupabase): Promise<(Channel & { member_ids: string[] })[]> {
  const [channels, members] = await Promise.all([
    supabase.from("channels").select("id, kind, client_id, name, archived, created_by, created_at"),
    supabase.from("channel_members").select("channel_id, user_id"),
  ])
  if (channels.error) throw loadError(channels.error, "os canais")
  if (members.error) throw loadError(members.error, "os participantes dos canais")
  const membersOf = new Map<string, string[]>()
  for (const member of members.data) {
    membersOf.set(member.channel_id, [...(membersOf.get(member.channel_id) ?? []), member.user_id])
  }
  return channels.data.map((channel) => ({ ...channel, member_ids: membersOf.get(channel.id) ?? [] }))
}

/* ------------------------------------------------------------------ */
/* Busca geral                                                         */
/* ------------------------------------------------------------------ */

export interface SearchSources {
  posts: { id: string; client_id: string; title: string; caption: string | null; format: ContentFormat; stage: ContentPost["stage"]; publish_on: DateKey | null }[]
  ideas: { id: string; client_id: string; title: string; notes: string | null; post_id: string | null }[]
  decisions: { id: string; title: string; context: string | null; decided_on: DateKey; status: "active" | "revoked" }[]
  docs: { id: string; title: string; summary: string | null }[]
  docHits: Set<string>
  meetings: { id: string; occurs_on: DateKey; summary: string | null; event: { title: string; client_id: string | null } | null }[]
  meetingHits: Set<string>
}

/**
 * O que a busca geral lê além das tarefas e do diretório: posts (título e
 * legenda), ideias, decisões, processos e reuniões. Textos longos
 * (processos, resumos e transcrições) usam a busca do Postgres, sem acento.
 * Financeiro e negócios ficam de fora.
 */
export async function loadSearchSources(supabase: McpSupabase, foldedQuery: string): Promise<SearchSources> {
  const fullText = foldedQuery.length >= 3
  const [posts, ideas, decisions, docs, docHits, meetings, meetingHits] = await Promise.all([
    supabase
      .from("content_posts")
      .select("id, client_id, title, caption, format, stage, publish_on")
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase.from("content_ideas").select("id, client_id, title, notes, post_id").order("created_at", { ascending: false }).limit(1000),
    supabase.from("decisions").select("id, title, context, decided_on, status").order("decided_on", { ascending: false }).limit(500),
    supabase.from("docs").select("id, title, summary").order("updated_at", { ascending: false }).limit(500),
    fullText
      ? supabase.from("docs").select("id").textSearch("search", foldedQuery, { config: "portuguese", type: "websearch" }).limit(50)
      : null,
    supabase
      .from("meetings")
      .select("id, occurs_on, summary, event:events(title, client_id)")
      .order("occurs_on", { ascending: false })
      .limit(300),
    fullText
      ? supabase.from("meetings").select("id").textSearch("search", foldedQuery, { config: "portuguese", type: "websearch" }).limit(50)
      : null,
  ])
  if (posts.error) throw loadError(posts.error, "os posts")
  if (ideas.error) throw loadError(ideas.error, "as ideias")
  if (decisions.error) throw loadError(decisions.error, "as decisões")
  if (docs.error) throw loadError(docs.error, "os processos")
  if (docHits?.error) throw loadError(docHits.error, "a busca nos processos")
  if (meetings.error) throw loadError(meetings.error, "as reuniões")
  if (meetingHits?.error) throw loadError(meetingHits.error, "a busca nas reuniões")
  return {
    posts: posts.data,
    ideas: ideas.data,
    decisions: decisions.data,
    docs: docs.data,
    docHits: new Set(docHits?.data.map((row) => row.id) ?? []),
    meetings: meetings.data,
    meetingHits: new Set(meetingHits?.data.map((row) => row.id) ?? []),
  }
}
