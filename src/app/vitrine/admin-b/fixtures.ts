import type { ChannelEntry, ChannelPreview, ThreadData, ThreadMessage } from "@/features/channels/logic"
import type { PostSummary } from "@/features/content/logic"
import type { Workspace } from "@/features/workspace/queries"
import { addDaysToKey } from "@/lib/dates"
import type {
  CalendarEvent,
  ClientDetail,
  ClientReview,
  Communication,
  ContentFormat,
  ContentFrontStatus,
  ContentIdea,
  ContentStage,
  DateKey,
  Deal,
  DealStage,
  LeadSource,
  Task,
} from "@/lib/types"

import { VITRINE_USER, vitrineEvents, vitrineTasks, vitrineWorkspace } from "../fixtures"

/*
 * Dados de exemplo do lote 2B da vitrine (Conteúdo, Clientes, Comunicações e
 * Comercial). Nada vem do banco: nomes e números inventados, com as datas
 * contadas a partir de hoje.
 */

const STAMP = "2026-10-01T12:00:00.000Z"
const ME = VITRINE_USER.id

const at = (today: DateKey, days: number, hour: string) => `${addDaysToKey(today, days)}T${hour}:00.000-03:00`

export const VB_CLIENTS: ClientDetail[] = [
  client("00000000-0000-4000-8000-0000000000a1", "Café Aurora", ["Social media", "Site", "Tráfego pago"], "u-bia", 10, "aurora.cafe", "Café de especialidade em Curitiba ☕ Torra própria."),
  client("00000000-0000-4000-8000-0000000000a2", "Studio Norte", ["Identidade visual", "Social media"], ME, 12, "studionorte", null),
  client("00000000-0000-4000-8000-0000000000a3", "Vela Arquitetura", ["Social media", "Tráfego pago"], ME, 8, "vela.arq", null),
  client("00000000-0000-4000-8000-0000000000a4", "Clínica Lume", ["Social media"], "u-bia", 15, "clinicalume", null),
  client("00000000-0000-4000-8000-0000000000a5", "Maré Surf Shop", ["Social media", "Site"], "u-leo", 5, "maresurf", null),
  client("00000000-0000-4000-8000-0000000000a6", "Boop", [], ME, null, null, null),
  { ...client("00000000-0000-4000-8000-0000000000a7", "Padaria Trigo", ["Social media"], null, null, null, null), active: false },
]

function client(
  id: string,
  name: string,
  services: string[],
  owner: string | null,
  reviewDay: number | null,
  handle: string | null,
  bio: string | null
): ClientDetail {
  return {
    id,
    name,
    active: true,
    avatar_path: null,
    instagram_handle: handle,
    instagram_bio: bio,
    owner_id: owner,
    services,
    since: "2025-03-01",
    contact_name: id === "00000000-0000-4000-8000-0000000000a1" ? "Marina Prado" : null,
    contact_email: id === "00000000-0000-4000-8000-0000000000a1" ? "marina@cafeaurora.com.br" : null,
    contact_phone: id === "00000000-0000-4000-8000-0000000000a1" ? "(41) 99876-5432" : null,
    notes: id === "00000000-0000-4000-8000-0000000000a1" ? "Prefere aprovar os posts às segundas. Fotos de produto: sempre com luz natural." : null,
    review_day: reviewDay,
    created_at: STAMP,
    updated_at: STAMP,
  }
}

/** A mesma equipe e os projetos da vitrine, com os clientes do lote e as pessoas do cliente. */
export function vbWorkspace(today: DateKey): Workspace {
  const base = vitrineWorkspace(today)
  return {
    ...base,
    projects: base.projects.map((project) => ({ ...project, client_id: asClient(project.client_id) })),
    clients: VB_CLIENTS.map(({ id, name, active, avatar_path, instagram_handle, instagram_bio }) => ({
      id,
      name,
      active,
      avatar_path,
      instagram_handle,
      instagram_bio,
    })),
    clientPeople: [
      { id: "cp-marina", full_name: "Marina Prado", avatar_url: null },
      { id: "cp-otavio", full_name: "Otávio Lins", avatar_url: null },
    ],
  }
}

/** Os ids de exemplo da vitrine viram UUIDs aqui (os filtros na URL só aceitam UUID). */
const CLIENT_IDS: Record<string, string> = {
  "c-aurora": "00000000-0000-4000-8000-0000000000a1",
  "c-norte": "00000000-0000-4000-8000-0000000000a2",
  "c-vela": "00000000-0000-4000-8000-0000000000a3",
}
const asClient = (id: string | null) => (id ? (CLIENT_IDS[id] ?? id) : id)

export function vbTasks(today: DateKey): Task[] {
  return vitrineTasks(today).map((task) => ({ ...task, client_id: asClient(task.client_id) }))
}

export function vbEvents(today: DateKey): CalendarEvent[] {
  return [
    ...vitrineEvents(today).map((event) => ({ ...event, client_id: asClient(event.client_id) })),
    {
      id: "e4",
      title: "Revisão mensal — Clínica Lume",
      description: null,
      event_type: "meeting",
      start_at: at(today, 3, "14:00"),
      end_at: null,
      all_day: false,
      recurrence_rule: null,
      client_id: "00000000-0000-4000-8000-0000000000a4",
      created_by: ME,
      created_at: STAMP,
    },
  ]
}

export function vbReviews(today: DateKey): ClientReview[] {
  const period = `${today.slice(0, 7)}-01`
  const review = (id: string, clientId: string, health: ClientReview["health"], done: boolean, monthsAgo = 0): ClientReview => {
    const date = new Date(`${period}T12:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() - monthsAgo)
    return {
      id,
      client_id: clientId,
      period: date.toISOString().slice(0, 10),
      health,
      checklist: [],
      notes: null,
      done,
      done_at: done ? STAMP : null,
      done_by: done ? ME : null,
      created_by: ME,
      created_at: STAMP,
      updated_at: STAMP,
    }
  }
  return [
    review("r1", "00000000-0000-4000-8000-0000000000a1", "healthy", true),
    review("r2", "00000000-0000-4000-8000-0000000000a2", "attention", false),
    review("r3", "00000000-0000-4000-8000-0000000000a3", "healthy", true),
    review("r4", "00000000-0000-4000-8000-0000000000a5", "at_risk", false, 1),
    review("r5", "00000000-0000-4000-8000-0000000000a1", "healthy", true, 1),
    review("r6", "00000000-0000-4000-8000-0000000000a1", "attention", true, 2),
    review("r7", "00000000-0000-4000-8000-0000000000a1", "healthy", true, 3),
    review("r8", "00000000-0000-4000-8000-0000000000a4", "healthy", true, 1),
  ]
}

/* Conteúdo */

type Fronts = [ContentFrontStatus, ContentFrontStatus, ContentFrontStatus]

export function vbPosts(today: DateKey): PostSummary[] {
  const post = (
    id: string,
    clientId: string,
    title: string,
    days: number | null,
    stage: ContentStage,
    format: ContentFormat,
    fronts: Fronts = ["done", "done", "not_needed"],
    extra: Partial<PostSummary> = {}
  ): PostSummary => ({
    id,
    client_id: clientId,
    project_id: null,
    title,
    format,
    networks: ["instagram"],
    intents: ["connection"],
    publish_on: days === null ? null : addDaysToKey(today, days),
    publish_time: days === null ? null : "18:00:00",
    stage,
    copy_status: fronts[0],
    design_status: fronts[1],
    video_status: fronts[2],
    owner_id: extra.owner_id ?? "u-bia",
    drive_url: null,
    cover_path: null,
    pinned: false,
    published_at: stage === "published" && days !== null ? `${addDaysToKey(today, days)}T21:00:00.000Z` : null,
    auto_publish: false,
    publish_status: null,
    publish_error: null,
    publish_attempts: 0,
    instagram_permalink: null,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  })
  return [
    post("p1", "00000000-0000-4000-8000-0000000000a1", "Lançamento do blend de inverno", 2, "client_review", "carousel", ["done", "done", "not_needed"]),
    post("p2", "00000000-0000-4000-8000-0000000000a1", "Bastidores da torra", 3, "client_review", "reels", ["done", "not_needed", "in_review"]),
    post("p3", "00000000-0000-4000-8000-0000000000a1", "Receita: cold brew de laranja", 5, "approved", "static"),
    post("p4", "00000000-0000-4000-8000-0000000000a1", "Novo horário aos domingos", 1, "scheduled", "stories", ["done", "done", "not_needed"], { auto_publish: true, publish_status: "queued" }),
    post("p5", "00000000-0000-4000-8000-0000000000a1", "Conheça nossos baristas", 8, "production", "carousel", ["in_progress", "todo", "not_needed"]),
    post("p6", "00000000-0000-4000-8000-0000000000a1", "Combo café + croissant", -2, "published", "static", undefined, { pinned: true }),
    post("p7", "00000000-0000-4000-8000-0000000000a1", "Origem: fazenda no Cerrado", -5, "published", "carousel"),
    post("p8", "00000000-0000-4000-8000-0000000000a1", "Latte art em 15 segundos", -9, "published", "reels", ["done", "not_needed", "done"]),
    post("p9", "00000000-0000-4000-8000-0000000000a1", "Dia do café com desconto", -13, "published", "static"),
    post("p10", "00000000-0000-4000-8000-0000000000a2", "Apresentação da nova marca", 0, "internal_review", "carousel", ["done", "in_review", "not_needed"], { owner_id: "u-leo" }),
    post("p11", "00000000-0000-4000-8000-0000000000a2", "Manifesto do estúdio", 4, "production", "reels", ["in_progress", "not_needed", "missing_material"], { owner_id: "u-leo" }),
    post("p12", "00000000-0000-4000-8000-0000000000a3", "Projeto Casa Jardim: antes e depois", -1, "approved", "carousel", ["done", "done", "not_needed"], { owner_id: ME }),
    post("p13", "00000000-0000-4000-8000-0000000000a3", "Tendências de 2027 em interiores", 6, "production", "carousel", ["todo", "todo", "not_needed"], { owner_id: ME }),
    post("p14", "00000000-0000-4000-8000-0000000000a4", "Mitos e verdades do clareamento", 1, "client_review", "carousel"),
    post("p15", "00000000-0000-4000-8000-0000000000a4", "Equipe Lume: Dra. Helena", 2, "scheduled", "static", undefined, { auto_publish: true, publish_status: "queued" }),
    post("p16", "00000000-0000-4000-8000-0000000000a4", "Depoimento: sorriso novo", -3, "production", "reels", ["done", "not_needed", "missing_material"]),
    post("p17", "00000000-0000-4000-8000-0000000000a5", "Coleção verão 27 chegou", 0, "approved", "reels", ["done", "not_needed", "done"], { owner_id: "u-leo" }),
    post("p18", "00000000-0000-4000-8000-0000000000a5", "Previsão do swell da semana", 3, "production", "stories", ["todo", "todo", "not_needed"], { owner_id: "u-leo" }),
    post("p19", "00000000-0000-4000-8000-0000000000a5", "Aula de surfe para iniciantes", 10, "production", "video", ["todo", "not_needed", "todo"], { owner_id: "u-leo" }),
    post("p20", "00000000-0000-4000-8000-0000000000a2", "Case: nova papelaria", -4, "published", "carousel", undefined, { owner_id: "u-leo" }),
  ]
}

export function vbIdeas(): ContentIdea[] {
  const idea = (id: string, clientId: string, title: string, notes: string | null, format: ContentFormat | null, url: string | null, postId: string | null = null): ContentIdea => ({
    id,
    client_id: clientId,
    title,
    notes,
    format,
    reference_url: url,
    post_id: postId,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    idea("i1", "00000000-0000-4000-8000-0000000000a1", "Série “um café, uma história”", "Clientes fiéis contam o pedido de sempre. Fotos em P&B.", "carousel", "https://www.instagram.com/p/exemplo"),
    idea("i2", "00000000-0000-4000-8000-0000000000a1", "Tour pela torrefação em POV", "Câmera no peito do mestre de torra, sem fala, só som ambiente.", "reels", null),
    idea("i3", "00000000-0000-4000-8000-0000000000a5", "Guia de pranchas por nível", null, "carousel", "https://pinterest.com/pin/exemplo"),
    idea("i4", "00000000-0000-4000-8000-0000000000a4", "Perguntas da semana nos stories", "Caixinha às segundas, respostas em vídeo às quartas.", "stories", null),
    idea("i5", "00000000-0000-4000-8000-0000000000a3", "Antes e depois em vídeo", "Transição com o mesmo enquadramento.", "reels", null),
    idea("i6", "00000000-0000-4000-8000-0000000000a1", "Conheça nossos baristas", null, "carousel", null, "p5"),
  ]
}

/* Comunicações */

export function vbChannels(today: DateKey): ChannelEntry[] {
  const channel = (
    id: string,
    kind: ChannelEntry["kind"],
    name: string | null,
    clientId: string | null,
    counts: Partial<ChannelEntry["counts"]> = {},
    extra: Partial<ChannelEntry> = {}
  ): ChannelEntry => ({
    id,
    kind,
    client_id: clientId,
    client_user_id: null,
    name,
    archived: false,
    created_by: ME,
    created_at: STAMP,
    member_ids: [ME, "u-leo", "u-bia"],
    counts: { unread: 0, pending: 0, last_message_at: at(today, -2, "10:00"), ...counts },
    ...extra,
  })
  return [
    channel("ch-aurora", "client", "Alterações – Café Aurora", "00000000-0000-4000-8000-0000000000a1", { unread: 3, pending: 2, last_message_at: at(today, 0, "11:42") }),
    channel("ch-norte", "client", "Alterações – Studio Norte", "00000000-0000-4000-8000-0000000000a2", { pending: 1, last_message_at: at(today, -1, "17:05") }),
    channel("ch-vela", "client", "Alterações – Vela Arquitetura", "00000000-0000-4000-8000-0000000000a3"),
    channel("ch-lume", "client", "Alterações – Clínica Lume", "00000000-0000-4000-8000-0000000000a4", { unread: 1, last_message_at: at(today, 0, "09:12") }),
    channel("ch-mare", "client", "Alterações – Maré Surf Shop", "00000000-0000-4000-8000-0000000000a5"),
    channel("ch-marina", "direct", null, "00000000-0000-4000-8000-0000000000a1", { last_message_at: at(today, -1, "08:40") }, { client_user_id: "cp-marina", member_ids: [ME] }),
    channel("ch-fin", "internal", "Financeiro", null, { last_message_at: at(today, -3, "16:00") }, { member_ids: [ME, "u-bia"] }),
    channel("ch-ideias", "internal", "Ideias e referências", null, { unread: 2, last_message_at: at(today, 0, "08:05") }),
    channel("ch-leo", "direct", null, null, { last_message_at: at(today, -1, "19:30") }, { member_ids: [ME, "u-leo"] }),
    channel("ch-trigo", "client", "Alterações – Padaria Trigo", "00000000-0000-4000-8000-0000000000a7", {}, { archived: false }),
  ]
}

export function vbPreviews(today: DateKey): Record<string, ChannelPreview> {
  const preview = (author: string | null, body: string, days: number, hour: string, kind: ChannelPreview["kind"] = "text"): ChannelPreview => ({
    author_id: author,
    kind,
    body,
    internal: false,
    created_at: at(today, days, hour),
  })
  return {
    "ch-aurora": preview("cp-marina", "Podemos usar a segunda foto como capa?", 0, "11:42", "change_request"),
    "ch-norte": preview("cp-otavio", "Trocar o tom do azul no slide 3", -1, "17:05", "change_request"),
    "ch-vela": preview(ME, "Agendado para quinta às 18h ✅", -2, "10:00"),
    "ch-lume": preview("u-bia", "Subi o carrossel do clareamento", 0, "09:12"),
    "ch-mare": preview("u-leo", "Fotos da coleção no drive", -2, "10:00"),
    "ch-marina": preview("cp-marina", "Obrigada! Vou ver com o time.", -1, "08:40"),
    "ch-fin": preview("u-bia", "Notas de outubro conferidas", -3, "16:00"),
    "ch-ideias": preview("u-leo", "Olha essa referência de carrossel", 0, "08:05"),
    "ch-leo": preview("u-leo", "Fechado, mando amanhã cedo", -1, "19:30"),
  }
}

export function vbThread(today: DateKey): ThreadData {
  const message = (
    id: string,
    author: string,
    body: string,
    days: number,
    hour: string,
    extra: Partial<ThreadMessage> = {}
  ): ThreadMessage => ({
    id,
    channel_id: "ch-aurora",
    post_id: null,
    project_id: null,
    author_id: author,
    kind: "text",
    body,
    resolved_at: null,
    resolved_by: null,
    task_id: null,
    internal: false,
    created_at: at(today, days, hour),
    edited_at: null,
    post: null,
    project: null,
    audio: null,
    ...extra,
  })
  const blend = {
    id: "p1",
    client_id: "00000000-0000-4000-8000-0000000000a1",
    title: "Lançamento do blend de inverno",
    stage: "client_review" as const,
    format: "carousel" as const,
    cover_path: null,
    publish_on: addDaysToKey(today, 2),
  }
  const torra = { ...blend, id: "p2", title: "Bastidores da torra", format: "reels" as const, publish_on: addDaysToKey(today, 3) }
  const pending = [
    message("m4", "cp-marina", "Podemos usar a segunda foto como capa? Ficou mais quente.", 0, "09:15", { kind: "change_request", post_id: "p2", post: torra }),
    message("m6", "cp-marina", "No slide 4, trocar “edição limitada” por “só neste inverno”.", 0, "11:42", { kind: "change_request", post_id: "p1", post: blend }),
  ]
  return {
    messages: [
      message("m1", "u-bia", "Bom dia, Marina! Subimos o carrossel do blend de inverno para você aprovar 💛", -1, "10:02", { post_id: "p1", post: blend }),
      message("m2", "cp-marina", "Que lindo! Vou olhar com calma à tarde.", -1, "10:30"),
      message("m3", "u-leo", "Combinei com a Bia: se ela pedir a foto 2, já temos tratada.", -1, "14:10", { internal: true }),
      pending[0]!,
      message("m5", "u-bia", "Perfeito, troco ainda hoje e te aviso por aqui.", 0, "09:40"),
      pending[1]!,
    ],
    hasMore: false,
    pending,
    reads: [
      { user_id: "cp-marina", last_read_at: at(today, 0, "11:42") },
      { user_id: "u-bia", last_read_at: at(today, 0, "09:40") },
    ],
  }
}

export function vbCommunications(today: DateKey): Communication[] {
  const communication = (id: string, clientId: string, summary: string, days: number, kind: Communication["kind"], channel: Communication["channel"]): Communication => ({
    id,
    client_id: clientId,
    project_id: null,
    kind,
    channel,
    summary,
    details: null,
    occurred_on: addDaysToKey(today, days),
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    communication("co1", "00000000-0000-4000-8000-0000000000a1", "Alinhamos a pauta de novembro por ligação", -6, "update", "call"),
    communication("co2", "00000000-0000-4000-8000-0000000000a1", "Aprovou o orçamento da campanha de verão", -12, "approval", "whatsapp"),
  ]
}

/* Comercial */

export function vbDeals(today: DateKey): Deal[] {
  const deal = (
    id: string,
    title: string,
    stage: DealStage,
    recurring: number,
    oneTime: number,
    source: LeadSource,
    extra: Partial<Deal> = {}
  ): Deal => ({
    id,
    title,
    client_id: null,
    company: title.split(" — ")[0] ?? null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    source,
    service: "Social media",
    stage,
    reached_stage: stage,
    owner_id: ME,
    recurring_cents: recurring * 100,
    one_time_cents: oneTime * 100,
    term_months: 12,
    probability: null,
    opened_on: addDaysToKey(today, -20),
    expected_close_on: addDaysToKey(today, 14),
    proposal_sent_on: stage === "proposal" || stage === "negotiation" ? addDaysToKey(today, -6) : null,
    closed_on: stage === "won" || stage === "lost" ? addDaysToKey(today, -4) : null,
    lost_reason: stage === "lost" ? "Preço" : null,
    project_id: null,
    recurrence_id: null,
    notes: null,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  })
  // Última mudança n dias atrás (os alertas de parado e sem contato saem daí).
  const touched = (days: number) => `${addDaysToKey(today, -days)}T15:00:00.000Z`
  return [
    deal("d1", "Empório Raiz — social media", "lead", 2800, 0, "instagram", { contact_name: "Rafaela Moura", opened_on: addDaysToKey(today, -3), updated_at: touched(3) }),
    deal("d2", "Ótica Clara — tráfego pago", "lead", 1800, 0, "referral", { owner_id: "u-bia", opened_on: today, updated_at: touched(0), service: "Tráfego pago" }),
    deal("d9", "Studio Ondas — pilates", "lead", 1600, 0, "website", { contact_name: "Camila Reis", opened_on: addDaysToKey(today, -1), updated_at: touched(1), expected_close_on: null }),
    deal("d3", "Hotel Serra Azul — site e social", "contact", 3500, 9000, "website", { service: "Site", contact_name: "Marcos Tavares", updated_at: touched(9) }),
    deal("d10", "Barbearia Navalha — social", "contact", 1900, 0, "whatsapp", { owner_id: "u-bia", contact_name: "Diego Alves", updated_at: touched(1) }),
    deal("d4", "Café Aurora — tráfego pago (upsell)", "proposal", 1500, 0, "existing_client", { client_id: "00000000-0000-4000-8000-0000000000a1", company: null, service: "Tráfego pago", updated_at: touched(2) }),
    deal("d5", "Academia Vértice — rebranding", "proposal", 0, 14000, "linkedin", { service: "Identidade visual", term_months: null, expected_close_on: addDaysToKey(today, -2), contact_name: "Paula Nery", updated_at: touched(4) }),
    deal("d11", "Doceria Ka — link na bio", "proposal", 0, 97, "google", { owner_id: "u-leo", service: "Link na Bio", expected_close_on: addDaysToKey(today, 1), updated_at: touched(0) }),
    deal("d6", "Vela Arquitetura — renovação", "negotiation", 3200, 0, "existing_client", { client_id: "00000000-0000-4000-8000-0000000000a3", company: null, probability: 80, updated_at: touched(1) }),
    deal("d12", "Sorriso Pleno — social e tráfego", "negotiation", 4200, 2500, "linkedin", { owner_id: "u-bia", contact_name: "Dra. Helena Prado", updated_at: touched(8), expected_close_on: addDaysToKey(today, 6) }),
    deal("d7", "Clínica Lume — social media", "won", 2600, 1500, "referral", { client_id: "00000000-0000-4000-8000-0000000000a4", company: null }),
    deal("d8", "Pizzaria Forno 9 — social", "lost", 2200, 0, "whatsapp"),
  ]
}
