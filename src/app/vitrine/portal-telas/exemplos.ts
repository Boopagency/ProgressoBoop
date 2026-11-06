import { EMPTY_VALUES, type MetricReading } from "@/features/instagram/metrics-logic"
import type { InstagramCardData } from "@/features/instagram/queries"
import type { PortalClientFile } from "@/features/client-files/logic"
import type { ClientStatement, FinanceItem } from "@/features/finance/logic"
import type { PortalChannelMessage, PortalDirectConversation } from "@/features/portal/channel-queries"
import type { PortalPost } from "@/features/portal/content-logic"
import type { PortalNotification } from "@/features/portal/notification-logic"
import type { PortalReferral } from "@/features/portal/referral-logic"
import type { PortalMessage } from "@/features/portal/content-queries"
import type { PortalProject, PortalStep, PortalStepApproval } from "@/features/portal/project-logic"
import type { Deliverable } from "@/features/deliverables/logic"
import { addDaysToKey } from "@/lib/dates"
import type { ContentFormat, ContentStage, DateKey } from "@/lib/types"

/*
 * Dados de exemplo das telas do portal na vitrine (só em desenvolvimento):
 * a Marina, do Café Aurora. Nada vem do banco. As "fotos" dos posts são
 * desenhos em SVG (data:), para o feed e o post aberto terem imagem.
 */

export const STAMP = "2026-10-01T12:00:00.000Z"
export const CLIENT = { id: "c-aurora", name: "Café Aurora" }
export const USER = { name: "Marina", email: "marina@cafeaurora.com.br", avatarUrl: null }

/* As "fotos": fundo em gradiente, uma xícara vista de cima e um brilho. */
const PALETTES = [
  ["#3b2418", "#a0643a", "#f3dcc0"],
  ["#1d2b3a", "#4d7ea8", "#f0e6d8"],
  ["#5a3a24", "#d29a5c", "#fff2df"],
  ["#2a1d2e", "#8a5a7a", "#f6e2d3"],
  ["#20302a", "#6f9a7d", "#efe8d6"],
  ["#4a2a1a", "#c4703a", "#ffe9cf"],
  ["#14213d", "#2b8fd9", "#e9f1fb"],
  ["#3e2c23", "#b88b6a", "#f7efe6"],
] as const

export function art(seed: number): string {
  const [dark, mid, light] = PALETTES[seed % PALETTES.length]!
  const x = 380 + ((seed * 137) % 320)
  const y = 520 + ((seed * 89) % 360)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1080 1350'>
<defs>
<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${mid}'/><stop offset='1' stop-color='${dark}'/></linearGradient>
<radialGradient id='c' cx='.5' cy='.45' r='.6'><stop offset='0' stop-color='${dark}'/><stop offset='.7' stop-color='${mid}'/><stop offset='1' stop-color='${dark}'/></radialGradient>
<radialGradient id='l' cx='.2' cy='.1' r='.8'><stop offset='0' stop-color='${light}' stop-opacity='.55'/><stop offset='1' stop-color='${light}' stop-opacity='0'/></radialGradient>
</defs>
<rect width='1080' height='1350' fill='url(#g)'/>
<rect width='1080' height='1350' fill='url(#l)'/>
<ellipse cx='${x + 24}' cy='${y + 40}' rx='300' ry='300' fill='${dark}' opacity='.35'/>
<circle cx='${x}' cy='${y}' r='290' fill='${light}'/>
<circle cx='${x}' cy='${y}' r='220' fill='url(#c)'/>
<ellipse cx='${x - 60}' cy='${y - 70}' rx='70' ry='30' fill='${light}' opacity='.35' transform='rotate(-30 ${x - 60} ${y - 70})'/>
<path d='M${x + 280} ${y - 40} q120 10 110 120 q-10 90 -120 80' fill='none' stroke='${light}' stroke-width='46'/>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

interface PostSeed {
  id: string
  title: string
  days: number | null
  stage: ContentStage
  format: ContentFormat
  images?: number
  caption?: string
  pinned?: boolean
  time?: string
  slides?: string[]
}

export function posts(today: DateKey): PortalPost[] {
  let seed = 0
  const post = (item: PostSeed): PortalPost => {
    const count = item.images ?? 1
    const slides = Array.from({ length: Math.max(count, item.slides?.length ?? 0) }, (_, index) => ({
      text: item.slides?.[index] ?? "",
      image_path: index < count ? art(seed + index) : null,
    }))
    seed += 3
    return {
      id: item.id,
      title: item.title,
      format: item.format,
      networks: ["instagram"],
      publish_on: item.days === null ? null : addDaysToKey(today, item.days),
      publish_time: item.time ?? "18:00",
      stage: item.stage,
      caption: item.caption ?? null,
      slides: count > 0 ? slides : [],
      cover_path: null,
      pinned: item.pinned ?? false,
      published_at: item.stage === "published" && item.days !== null ? `${addDaysToKey(today, item.days)}T21:00:00.000Z` : null,
      updated_at: STAMP,
    }
  }
  return [
    post({
      id: "po1",
      title: "Lançamento do blend de inverno",
      days: 2,
      stage: "client_review",
      format: "carousel",
      images: 4,
      caption:
        "Chegou o blend que abraça. ☕️❄️\n\nNotas de chocolate amargo, caramelo e um final de laranja: o Blend de Inverno é torrado aqui, toda semana, em pequenos lotes.\n\nJá provou? Conta pra gente nos comentários 👇\n\n#cafeaurora #cafeespecial #blenddeinverno",
      slides: [
        "O blend que abraça.",
        "Chocolate amargo, caramelo e laranja.",
        "Torrado toda semana, em pequenos lotes.",
        "Disponível na loja e no site.",
      ],
    }),
    post({ id: "po2", title: "Bastidores da torra", days: 3, stage: "client_review", format: "reels", time: "12:00" }),
    post({ id: "po3", title: "Receita: cold brew de laranja", days: 5, stage: "approved", format: "static" }),
    post({ id: "po4", title: "Novo horário aos domingos", days: 6, stage: "scheduled", format: "stories", time: "09:00" }),
    post({ id: "po5", title: "Conheça nossos baristas", days: 8, stage: "scheduled", format: "carousel", images: 3 }),
    post({ id: "po6", title: "Promo: pão de queijo + coado", days: 10, stage: "production", format: "static" }),
    post({ id: "po7", title: "Dia do café em casa", days: 13, stage: "scheduled", format: "carousel", images: 2 }),
    post({
      id: "pp1",
      title: "Nosso cardápio de outono",
      days: -2,
      stage: "published",
      format: "carousel",
      images: 3,
      caption: "Outono no Aurora: canela, maçã e muito café. 🍂",
    }),
    post({ id: "pp2", title: "Latte art: o coração perfeito", days: -4, stage: "published", format: "reels" }),
    post({ id: "pp3", title: "Feriado: abrimos normalmente", days: -6, stage: "published", format: "static", pinned: true }),
    post({ id: "pp4", title: "Café da tarde em família", days: -9, stage: "published", format: "static" }),
    post({ id: "pp5", title: "Grãos do sul de Minas", days: -12, stage: "published", format: "carousel", images: 2 }),
    post({ id: "pp6", title: "Vem aí: blend de inverno", days: -15, stage: "published", format: "static", pinned: true }),
    post({ id: "pp7", title: "Bolo de fubá da vó", days: -18, stage: "published", format: "static" }),
    post({ id: "pn1", title: "Ideias para o Natal", days: null, stage: "client_review", format: "carousel", images: 0 }),
  ]
}

/* Feed: o perfil, a conta conectada e as visualizações dos publicados. */

export const PROFILE = {
  handle: "cafeaurora",
  bio: "Café especial torrado em casa ☕️\nCuritiba · todos os dias, das 7h às 19h\nPeça pelo site 👇",
  avatar: art(6),
}

export function instagram(today: DateKey): InstagramCardData {
  return {
    configured: true,
    account: {
      username: "cafeaurora",
      displayName: "Café Aurora",
      pictureUrl: null,
      accountType: "business",
      permissions: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
      status: "connected",
      tokenExpiresAt: `${addDaysToKey(today, 48)}T12:00:00.000Z`,
      connectedAt: `${addDaysToKey(today, -12)}T15:00:00.000Z`,
      connectedByName: "Marina",
    },
  }
}

export const FEED_VIEWS: Record<string, number> = {
  pp1: 4820,
  pp2: 12940,
  pp3: 2310,
  pp4: 3105,
  pp5: 2780,
  pp6: 5620,
  pp7: 1980,
}

/* Post aberto: a conversa do post e as leituras do Instagram do publicado. */

const at = (today: DateKey, days: number, hour: string) => `${addDaysToKey(today, days)}T${hour}:00.000-03:00`

export function postMessages(today: DateKey): PortalMessage[] {
  const message = (
    id: string,
    author: string,
    body: string,
    days: number,
    hour: string,
    extra: Partial<Pick<PortalMessage, "kind" | "from_team" | "mine" | "audio">> = {}
  ): PortalMessage => ({
    id,
    kind: extra.kind ?? "text",
    body,
    author_name: author,
    from_team: extra.from_team ?? true,
    mine: extra.mine ?? false,
    resolved: false,
    created_at: at(today, days, hour),
    edited_at: null,
    audio: extra.audio ?? null,
  })
  return [
    message("pm1", "Bia Santos", "Oi, Marina! Subimos o carrossel do blend de inverno. São 4 slides, a capa é a foto da xícara 💛", -1, "16:05"),
    message("pm2", "Bia Santos", "A legenda já está com as hashtags que combinamos.", -1, "16:06"),
    message("pm3", "Marina", "Que lindo! Só uma dúvida: dá para trocar 'abraça' por 'aquece' no primeiro slide?", 0, "09:12", {
      from_team: false,
      mine: true,
    }),
    message("pm4", "Bia Santos", "Dá sim! Vou te mandar as duas versões para você escolher.", 0, "09:30"),
  ]
}

export function readings(today: DateKey): MetricReading[] {
  const reading = (checkpoint: MetricReading["checkpoint"], days: number, views: number, reach: number, likes: number): MetricReading => ({
    ...EMPTY_VALUES,
    post_id: "pp1",
    checkpoint,
    collected_at: at(today, days, "19:05"),
    media_kind: "feed",
    views,
    reach,
    likes,
    comments: Math.round(likes / 9),
    saved: Math.round(likes / 4),
    shares: Math.round(likes / 7),
    total_interactions: null,
    profile_visits: Math.round(reach / 40),
  })
  return [reading("1h", -2, 640, 512, 58), reading("24h", -1, 3180, 2410, 241), reading("3d", 0, 4820, 3560, 356)]
}

/* Projetos: os projetos, as etapas que o cliente vê, as aprovações e as entregas. */

export function projects(today: DateKey): PortalProject[] {
  const project = (id: string, name: string, template: string | null, status: PortalProject["status"], total: number, done: number, due: number | null): PortalProject => ({
    id,
    name,
    template,
    status,
    starts_on: addDaysToKey(today, -40),
    due_on: due === null ? null : addDaysToKey(today, due),
    completed_at: status === "done" ? `${addDaysToKey(today, -3)}T15:00:00.000Z` : null,
    tasks_total: total,
    tasks_done: done,
  })
  return [
    project("pp1", "Site novo do Café Aurora", "site", "active", 24, 17, 18),
    project("pp2", "Campanha de verão", null, "planned", 12, 2, 40),
    project("pp3", "Identidade das embalagens", "identity", "active", 9, 8, -2),
    project("pp4", "Fotos do cardápio", null, "done", 6, 6, null),
  ]
}

export function projectSteps(today: DateKey): PortalStep[][] {
  const step = (id: string, title: string, status: PortalStep["status"], due: number, completed: number | null = null): PortalStep => ({
    id,
    title,
    status,
    due_date: addDaysToKey(today, due),
    completed_at: completed === null ? null : `${addDaysToKey(today, completed)}T14:00:00.000Z`,
  })
  return [
    [
      step("s0", "Briefing e referências", "done", -30, -31),
      step("s1", "Layout da página inicial", "done", -1, -1),
      step("s2", "Páginas internas", "doing", 6),
      step("s3", "Revisão final", "todo", 14),
      step("s4", "Publicação", "todo", 18),
    ],
    [step("v1", "Planejamento da campanha", "todo", 12)],
    [step("e1", "Aprovação das embalagens", "doing", -2)],
    [],
  ]
}

export function stepApprovals(today: DateKey): PortalStepApproval[] {
  const approval = (id: string, title: string, extra: Partial<PortalStepApproval>): PortalStepApproval => ({
    id,
    project_id: "pp1",
    project_name: "Site novo do Café Aurora",
    title,
    status: "done",
    due_date: null,
    completed_at: null,
    awaiting: false,
    approval: null,
    note: null,
    decided_by_name: null,
    decided_at: null,
    ...extra,
  })
  return [
    approval("s0", "Briefing e referências", {
      approval: "approved",
      note: "Perfeito, era isso mesmo!",
      decided_by_name: "Marina",
      decided_at: `${addDaysToKey(today, -30)}T10:00:00.000Z`,
    }),
    approval("s1", "Layout da página inicial", { awaiting: true, completed_at: `${addDaysToKey(today, -1)}T14:00:00.000Z` }),
    approval("s3", "Revisão final", { status: "todo" }),
  ]
}

export function deliverables(today: DateKey): Map<string, Deliverable[]> {
  const item = (id: string, title: string, kind: Deliverable["kind"], url: string | null, mime: string | null): Deliverable => ({
    id,
    task_id: "s1",
    kind,
    title,
    url,
    file_path: kind === "file" ? `pp1/${id}.pdf` : null,
    mime_type: mime,
    created_at: `${addDaysToKey(today, -1)}T14:00:00.000Z`,
  })
  return new Map([
    [
      "s1",
      [
        item("d1", "Layout da home (PDF)", "file", null, "application/pdf"),
        item("d2", "Protótipo navegável", "link", "https://www.figma.com/proto/exemplo", null),
      ],
    ],
  ])
}

export function projectMessages(today: DateKey): PortalMessage[] {
  return postMessages(today)
    .slice(0, 1)
    .map((message) => ({
      ...message,
      id: "jm1",
      author_name: "Leo Martins",
      body: "Marina, o layout da página inicial está pronto! Deixei o PDF e o protótipo na etapa para você ver com calma.",
    }))
    .concat({
      ...postMessages(today)[2]!,
      id: "jm2",
      body: "Vou abrir agora no celular 😍",
    })
}

/* Documentos. */

export function files(today: DateKey): PortalClientFile[] {
  const file = (id: string, name: string, category: PortalClientFile["category"], mime: string, kb: number, days: number, description: string | null = null): PortalClientFile => ({
    id,
    name,
    category,
    description,
    file_name: `${name}.pdf`,
    mime_type: mime,
    size_bytes: kb * 1024,
    created_at: `${addDaysToKey(today, days)}T14:00:00.000Z`,
  })
  return [
    file("f1", "Contrato de prestação de serviços 2026", "contract", "application/pdf", 412, -60, "Social media e site, com vigência até dezembro."),
    file("f2", "Briefing do site novo", "briefing", "application/pdf", 230, -32),
    file("f3", "Manual da marca", "brand", "application/pdf", 8420, -20, "Cores, tipografia, aplicações do logo e o que evitar."),
    file("f4", "Logo em alta (PNG)", "brand", "image/png", 1830, -20),
    file("f5", "Relatório de outubro", "report", "application/pdf", 960, 0, "Alcance, posts com melhor desempenho e próximos passos."),
    file("f6", "Planilha de conteúdo do trimestre", "other", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 88, -10),
  ]
}

/* Financeiro: o extrato do cliente, como a página monta (`clientStatement`). */

export function statement(today: DateKey, late: boolean): ClientStatement {
  const item = (key: string, description: string, cents: number, due: number, paid: number | null = null): FinanceItem => ({
    key,
    entry: null,
    recurrence: null,
    kind: "income",
    account: "client_revenue",
    description,
    amount_cents: cents,
    fee_cents: 0,
    due_on: addDaysToKey(today, due),
    paid_on: paid === null ? null : addDaysToKey(today, paid),
    skipped: false,
    category: null,
    client_id: CLIENT.id,
    project_id: null,
    period: null,
  })
  const overdue = late ? [item("o1", "Social media · outubro", 350000, -11)] : []
  return {
    overdue,
    overdueTotal: overdue.reduce((total, entry) => total + entry.amount_cents, 0),
    upcoming: [item("u1", "Social media · novembro", 350000, 20), item("u2", "Site novo · 2ª parcela", 420000, 26)],
    paid: [
      ...(late ? [] : [item("p0", "Social media · outubro", 350000, -11, -12)]),
      item("p1", "Site novo · 1ª parcela", 420000, -34, -34),
      item("p2", "Social media · setembro", 350000, -41, -40),
      item("p3", "Social media · agosto", 350000, -72, -71),
    ],
  }
}

/* Notificações. */

export function notifications(today: DateKey): PortalNotification[] {
  const note = (id: string, kind: PortalNotification["kind"], days: number, hour: string, read: boolean, extra: Partial<PortalNotification>): PortalNotification => ({
    id,
    kind,
    client_id: CLIENT.id,
    actor_name: null,
    title: null,
    body: null,
    link: "#",
    read_at: read ? at(today, days, "23:00") : null,
    created_at: at(today, days, hour),
    ...extra,
  })
  return [
    note("n1", "team_message", 0, "11:42", false, { actor_name: "Bia Santos", title: "Lançamento do blend de inverno", body: "Subimos o carrossel do blend de inverno! Dá uma olhada quando puder 💛" }),
    note("n2", "post_review", 0, "11:40", false, { actor_name: "Bia Santos", title: "Lançamento do blend de inverno" }),
    note("n3", "file_shared", 0, "09:05", false, { actor_name: "Jabez Oriel", title: "Relatório de outubro" }),
    note("n4", "step_approval", -1, "17:20", true, { actor_name: "Leo Martins", title: "Layout da página inicial", body: "Site novo do Café Aurora" }),
    note("n5", "step_done", -3, "15:10", true, { actor_name: "Leo Martins", title: "Briefing e referências", body: "Site novo do Café Aurora" }),
    note("n6", "payment_overdue", -8, "08:00", true, { title: "Social media · outubro" }),
  ]
}

/* Indicações. */

export function referrals(today: DateKey): PortalReferral[] {
  const referral = (id: string, name: string, company: string | null, status: PortalReferral["status"], days: number): PortalReferral => ({
    id,
    contact_name: name,
    company,
    status,
    created_at: `${addDaysToKey(today, days)}T14:00:00.000Z`,
  })
  return [
    referral("r1", "Ana Souza", "Padaria Bom Dia", "talking", -4),
    referral("r2", "Carlos Lima", "Studio Pilates Ar", "won", -40),
    referral("r3", "Fernanda Reis", null, "received", -1),
  ]
}

/* Comunicação: a conversa com a equipe, com post, projeto, aprovação e mensagens de voz. */

export function thread(today: DateKey): PortalChannelMessage[] {
  const message = (
    id: string,
    author: string,
    body: string,
    days: number,
    hour: string,
    extra: Partial<PortalChannelMessage> = {}
  ): PortalChannelMessage => ({
    id,
    kind: "text",
    body,
    author_name: author,
    from_team: true,
    mine: false,
    post: null,
    project: null,
    audio: null,
    created_at: at(today, days, hour),
    ...extra,
  })
  const marina = { from_team: false, mine: true }
  return [
    message("c1", "Leo Martins", "Bom dia, Marina! O layout da página inicial do site está pronto para você ver.", -1, "09:10", {
      project: { id: "pp1", name: "Site novo do Café Aurora" },
    }),
    message("c2", "Marina", "Oba! Vou olhar ainda hoje.", -1, "09:32", marina),
    message("c3", "Marina", "", -1, "09:33", { ...marina, audio: { duration_ms: 23000 } }),
    message("c4", "Leo Martins", "", -1, "10:02", { audio: { duration_ms: 41000 } }),
    message("c5", "Sistema", "Marina aprovou “Receita: cold brew de laranja”", -1, "15:40", { kind: "system", from_team: false }),
    message("c6", "Bia Santos", "Subimos o carrossel do blend de inverno! Dá uma olhada quando puder 💛", 0, "11:42", {
      post: { id: "po1", title: "Lançamento do blend de inverno", stage: "client_review" },
    }),
    message("c7", "Bia Santos", "Se quiser, dá para trocar a ordem dos slides também.", 0, "11:43"),
    message("c8", "Marina", "Amei! Só queria a segunda foto como capa. Pode ser?", 0, "12:05", marina),
  ]
}

export const DIRECTS: PortalDirectConversation[] = [
  { channel_id: "dm-leo", team_name: "Leo Martins", team_avatar_url: null, archived: false, unread: 1, last_message_at: STAMP },
]
