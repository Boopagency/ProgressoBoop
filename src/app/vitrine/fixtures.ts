import { DEFAULT_SETTINGS, type FinanceData } from "@/features/finance/management"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import type { PortalPost } from "@/features/portal/content-logic"
import type { PortalProject, PortalStepApproval } from "@/features/portal/project-logic"
import type { Workspace } from "@/features/workspace/queries"
import { addDaysToKey } from "@/lib/dates"
import type { CalendarEvent, DateKey, Project, SessionUser, Task, TaskArea, TaskPriority, TaskStatus } from "@/lib/types"

/*
 * Dados de exemplo da vitrine (só em desenvolvimento). Nada aqui vem do
 * banco: são nomes e números inventados, com as datas contadas a partir de
 * hoje para as listas (atrasadas, hoje, semana) ficarem cheias.
 */

const STAMP = "2026-10-01T12:00:00.000Z"

export const VITRINE_USER: SessionUser = {
  id: "u-jabez",
  email: "jabez@exemplo.com",
  full_name: "Jabez Oriel",
  avatar_url: null,
}

const CLIENTS = [
  { id: "c-aurora", name: "Café Aurora" },
  { id: "c-norte", name: "Studio Norte" },
  { id: "c-vela", name: "Vela Arquitetura" },
]

export function vitrineWorkspace(today: DateKey): Workspace {
  const project = (id: string, name: string, client: string | null, pinned: boolean, due: number): Project => ({
    id,
    name,
    client_id: client,
    owner_id: VITRINE_USER.id,
    status: "active",
    template: null,
    description: null,
    starts_on: addDaysToKey(today, -30),
    due_on: addDaysToKey(today, due),
    pinned,
    completed_at: null,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return {
    profiles: [
      { id: VITRINE_USER.id, full_name: VITRINE_USER.full_name, avatar_url: null, role: "Direção" },
      { id: "u-leo", full_name: "Leo Martins", avatar_url: null, role: "Design" },
      { id: "u-bia", full_name: "Bia Santos", avatar_url: null, role: "Social media" },
    ],
    clients: CLIENTS.map((client) => ({ ...client, active: true, avatar_path: null, instagram_handle: null, instagram_bio: null })),
    projects: [
      project("p-site", "Site novo do Café Aurora", "c-aurora", true, 18),
      project("p-marca", "Rebranding Studio Norte", "c-norte", true, 32),
      project("p-boop", "Estruturação da Boop", null, true, 60),
    ],
    savedViews: [],
    clientPeople: [],
  }
}

export function vitrineTasks(today: DateKey): Task[] {
  const task = (
    id: string,
    title: string,
    due: number | null,
    extra: { status?: TaskStatus; priority?: TaskPriority; client?: string; project?: string; area?: TaskArea; who?: string[] } = {}
  ): Task => ({
    id,
    title,
    description: null,
    assignee_ids: extra.who ?? [VITRINE_USER.id],
    client_id: extra.client ?? null,
    project_id: extra.project ?? null,
    client_visible: false,
    client_approval_required: false,
    client_approval: null,
    client_approval_note: null,
    client_approval_by: null,
    client_approval_at: null,
    area: extra.area ?? null,
    status: extra.status ?? "todo",
    priority: extra.priority ?? "normal",
    due_date: due === null ? null : addDaysToKey(today, due),
    completed_at: extra.status === "done" ? `${addDaysToKey(today, -1)}T15:00:00.000Z` : null,
    meeting_id: null,
    doc_id: null,
    client_review_id: null,
    communication_id: null,
    content_post_id: null,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    task("t1", "Enviar proposta revisada para a Vela", -2, { priority: "high", client: "c-vela", area: "commercial" }),
    task("t2", "Aprovar paleta final do rebranding", -1, { client: "c-norte", project: "p-marca", who: [VITRINE_USER.id, "u-leo"] }),
    task("t3", "Revisar textos da home do site", 0, { client: "c-aurora", project: "p-site", priority: "high", status: "doing" }),
    task("t4", "Fechar pauta de novembro com a Bia", 0, { area: "operations", who: [VITRINE_USER.id, "u-bia"] }),
    task("t5", "Conferir notas fiscais de outubro", 0, { area: "finance" }),
    task("t6", "Gravar reels de bastidores", 2, { client: "c-aurora", who: ["u-bia"] }),
    task("t7", "Wireframe da página de cardápio", 3, { client: "c-aurora", project: "p-site", who: ["u-leo"] }),
    task("t8", "Reunião de alinhamento com o Studio Norte", 4, { client: "c-norte", project: "p-marca" }),
    task("t9", "Atualizar processo de onboarding", 1, { project: "p-boop", area: "operations" }),
    task("t10", "Moodboard da campanha de verão", -3, { client: "c-aurora", status: "done", who: ["u-leo"] }),
    task("t11", "Relatório mensal da Vela", -2, { client: "c-vela", status: "done" }),
    task("t12", "Ajustar logo para favicon", -1, { client: "c-norte", project: "p-marca", status: "done", who: ["u-leo"] }),
    task("t13", "Organizar arquivos do drive", 9, { project: "p-boop" }),
    task("t14", "Planejar Black Friday do Café Aurora", 12, { client: "c-aurora" }),
    task("t15", "Briefing do vídeo institucional", null, { client: "c-vela" }),
    task("t16", "Testar formulário de contato", 6, { client: "c-aurora", project: "p-site", status: "done", who: ["u-leo"] }),
  ]
}

export function vitrineEvents(today: DateKey): CalendarEvent[] {
  const at = (days: number, hour: string) => `${addDaysToKey(today, days)}T${hour}:00.000-03:00`
  const event = (id: string, title: string, start: string, type: CalendarEvent["event_type"], client: string | null): CalendarEvent => ({
    id,
    title,
    description: null,
    event_type: type,
    start_at: start,
    end_at: null,
    all_day: false,
    recurrence_rule: null,
    client_id: client,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
  })
  return [
    event("e1", "Weekly da equipe", at(0, "10:00"), "internal", null),
    event("e2", "Apresentação do site", at(0, "16:30"), "meeting", "c-aurora"),
    event("e3", "Entrega do manual da marca", at(2, "09:00"), "delivery", "c-norte"),
  ]
}

export const VITRINE_FINANCE: FinanceData = { entries: [], recurrences: [], settings: DEFAULT_SETTINGS, closings: [] }

/* Portal do cliente: a Marina, do Café Aurora. */

export const VITRINE_PORTAL_USER = { name: "Marina", email: "marina@exemplo.com", avatarUrl: null }

export function vitrinePortalPosts(today: DateKey): PortalPost[] {
  const post = (id: string, title: string, days: number, stage: PortalPost["stage"], format: PortalPost["format"]): PortalPost => ({
    id,
    title,
    format,
    networks: ["instagram"],
    publish_on: addDaysToKey(today, days),
    publish_time: "18:00",
    stage,
    caption: null,
    slides: [],
    cover_path: null,
    pinned: false,
    published_at: null,
    updated_at: STAMP,
  })
  return [
    post("po1", "Lançamento do blend de inverno", 2, "client_review", "carousel"),
    post("po2", "Bastidores da torra", 3, "client_review", "reels"),
    post("po3", "Receita: cold brew de laranja", 5, "approved", "static"),
    post("po4", "Novo horário aos domingos", 6, "scheduled", "stories"),
    post("po5", "Conheça nossos baristas", 8, "scheduled", "carousel"),
  ]
}

export function vitrinePortalSteps(today: DateKey): PortalStepApproval[] {
  return [
    {
      id: "s1",
      project_id: "pp1",
      project_name: "Site novo",
      title: "Layout da página inicial",
      status: "done",
      due_date: addDaysToKey(today, -1),
      completed_at: `${addDaysToKey(today, -1)}T14:00:00.000Z`,
      awaiting: true,
      approval: null,
      note: null,
      decided_by_name: null,
      decided_at: null,
    },
  ]
}

export function vitrinePortalProjects(today: DateKey): PortalProject[] {
  const project = (id: string, name: string, template: string | null, total: number, done: number, due: number): PortalProject => ({
    id,
    name,
    template,
    status: "active",
    starts_on: addDaysToKey(today, -40),
    due_on: addDaysToKey(today, due),
    completed_at: null,
    tasks_total: total,
    tasks_done: done,
  })
  return [
    project("pp1", "Site novo", "site", 24, 17, 18),
    project("pp2", "Campanha de verão", null, 12, 4, 40),
    project("pp3", "Identidade das embalagens", null, 9, 8, 6),
  ]
}

export function vitrinePortalMessages(today: DateKey): PortalChannelMessage[] {
  const message = (
    id: string,
    author: string,
    body: string,
    days: number,
    hour: string,
    extra: Partial<Pick<PortalChannelMessage, "from_team" | "mine" | "post" | "project">> = {}
  ): PortalChannelMessage => ({
    id,
    kind: "text",
    body,
    author_name: author,
    from_team: extra.from_team ?? true,
    mine: extra.mine ?? false,
    post: extra.post ?? null,
    project: extra.project ?? null,
    created_at: `${addDaysToKey(today, days)}T${hour}:00.000-03:00`,
    audio: null,
  })
  return [
    message("m1", "Bia Santos", "Subimos o carrossel do blend de inverno! Dá uma olhada quando puder 💛", 0, "11:42", {
      post: { id: "po1", title: "Lançamento do blend de inverno", stage: "client_review" },
    }),
    message("m2", "Marina", "Amei as fotos da torra. Podemos usar a segunda como capa?", 0, "09:15", {
      from_team: false,
      mine: true,
      post: { id: "po2", title: "Bastidores da torra", stage: "client_review" },
    }),
    message("m3", "Leo Martins", "O layout da página inicial está pronto para a sua aprovação.", -1, "17:20", {
      project: { id: "pp1", name: "Site novo" },
    }),
  ]
}

export const VITRINE_PORTAL_CLIENT = { id: "c-aurora", name: "Café Aurora" }
