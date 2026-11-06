import { addPeriods, periodOf } from "@/features/clients/logic"
import { DEFAULT_SETTINGS, type FinanceData } from "@/features/finance/management"
import type { MetricsSource } from "@/features/metrics/catalog"
import type { Workspace } from "@/features/workspace/queries"
import { addDaysToKey } from "@/lib/dates"
import type {
  ClientDetail,
  ClientReview,
  DateKey,
  Deal,
  DealStage,
  Decision,
  Doc,
  DocSummary,
  DocVersion,
  FinanceAccount,
  FinanceEntry,
  FinanceKind,
  FinanceRecurrence,
  KeyResult,
  LeadSource,
  MetricUnit,
  Objective,
  Project,
  TaskArea,
} from "@/lib/types"

import { VITRINE_USER, vitrineTasks, vitrineWorkspace } from "../fixtures"

/*
 * Dados de exemplo das telas de gestão (lote 2C da repaginada): financeiro,
 * indicadores, metas, relatórios, decisões e processos. Nada vem do banco;
 * nomes e números são inventados, com os meses contados a partir de hoje
 * (seis meses de histórico) para o DRE, a projeção e os gráficos ficarem cheios.
 */

const STAMP = "2026-10-01T12:00:00.000Z"
const ME = VITRINE_USER.id

const CLIENTS: { id: string; name: string; health: ClientDetail["review_day"] }[] = [
  { id: "c-aurora", name: "Café Aurora", health: 10 },
  { id: "c-norte", name: "Studio Norte", health: 12 },
  { id: "c-vela", name: "Vela Arquitetura", health: 15 },
  { id: "c-hertmann", name: "Hertmann Móveis", health: 20 },
  { id: "c-lume", name: "Lume Odontologia", health: 8 },
]

/** O espaço de trabalho da vitrine com os cinco clientes do financeiro. */
export function gestaoWorkspace(today: DateKey): Workspace {
  const base = vitrineWorkspace(today)
  return {
    ...base,
    clients: CLIENTS.map((client) => ({ id: client.id, name: client.name, active: true, avatar_path: null, instagram_handle: null, instagram_bio: null })),
  }
}

function clientDetails(today: DateKey): ClientDetail[] {
  return CLIENTS.map((client, index) => ({
    id: client.id,
    name: client.name,
    active: true,
    avatar_path: null,
    instagram_handle: null,
    instagram_bio: null,
    owner_id: ME,
    services: ["Social media"],
    since: addDaysToKey(today, -300 + index * 40),
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    notes: null,
    review_day: client.health,
    created_at: STAMP,
    updated_at: STAMP,
  }))
}

/* Financeiro */

const recurrence = (
  id: string,
  kind: FinanceKind,
  account: FinanceAccount,
  description: string,
  amount: number,
  day: number,
  startsOn: DateKey,
  extra: { client?: string; category?: string; endsOn?: DateKey } = {}
): FinanceRecurrence => ({
  id,
  kind,
  account,
  description,
  amount_cents: amount * 100,
  day_of_month: day,
  category: extra.category ?? null,
  client_id: extra.client ?? null,
  project_id: null,
  starts_on: startsOn,
  ends_on: extra.endsOn ?? null,
  notes: null,
  created_by: ME,
  created_at: STAMP,
  updated_at: STAMP,
})

let entrySeq = 0
const entry = (
  kind: FinanceKind,
  account: FinanceAccount,
  description: string,
  amount: number,
  dueOn: DateKey,
  paidOn: DateKey | null,
  extra: { client?: string; recurrence?: string; period?: DateKey; fee?: number; category?: string } = {}
): FinanceEntry => ({
  id: `fe-${(entrySeq += 1)}`,
  kind,
  account,
  description,
  amount_cents: Math.round(amount * 100),
  fee_cents: Math.round((extra.fee ?? 0) * 100),
  due_on: dueOn,
  paid_on: paidOn,
  skipped: false,
  category: extra.category ?? null,
  client_id: extra.client ?? null,
  project_id: null,
  recurrence_id: extra.recurrence ?? null,
  period: extra.period ?? null,
  notes: null,
  created_by: ME,
  created_at: STAMP,
  updated_at: STAMP,
})

const day = (period: DateKey, value: number): DateKey => `${period.slice(0, 8)}${String(value).padStart(2, "0")}`

export function gestaoFinance(today: DateKey): FinanceData {
  entrySeq = 0
  const current = periodOf(today)
  const opening = addPeriods(current, -6)
  const months = Array.from({ length: 7 }, (_, index) => addPeriods(opening, index))

  const recurrences: FinanceRecurrence[] = [
    recurrence("r-aurora", "income", "client_revenue", "Fee mensal Café Aurora", 4200, 5, opening, { client: "c-aurora", category: "Social media" }),
    recurrence("r-norte", "income", "client_revenue", "Fee mensal Studio Norte", 3500, 10, opening, { client: "c-norte", category: "Social media" }),
    recurrence("r-vela", "income", "client_revenue", "Fee mensal Vela Arquitetura", 2800, 15, addPeriods(opening, 2), { client: "c-vela", category: "Tráfego pago" }),
    recurrence("r-hertmann", "income", "client_revenue", "Fee mensal Hertmann Móveis", 5200, 20, addPeriods(opening, 4), { client: "c-hertmann", category: "Social media" }),
    recurrence("r-lume", "income", "client_revenue", "Fee mensal Lume Odontologia", 1900, 3, addPeriods(opening, 5), { client: "c-lume", category: "Social media" }),
    recurrence("r-escritorio", "expense", "fixed_cost", "Aluguel do escritório", 2400, 5, opening, { category: "Estrutura" }),
    recurrence("r-ferramentas", "expense", "fixed_cost", "Ferramentas (Adobe, Notion, Figma)", 890, 12, opening, { category: "Software" }),
    recurrence("r-contador", "expense", "fixed_cost", "Contabilidade", 650, 10, opening, { category: "Serviços" }),
    recurrence("r-freela", "expense", "direct_cost", "Editor de vídeo (freela)", 1800, 25, addPeriods(opening, 1), { category: "Produção" }),
  ]

  const entries: FinanceEntry[] = []
  for (const period of months) {
    const past = period < current
    for (const item of recurrences) {
      if (item.starts_on > period) continue
      const due = day(period, item.day_of_month)
      // Os meses passados ficam pagos; no mês atual, só o que já venceu (menos um atraso de exemplo).
      const late = item.id === "r-lume" && period === current
      const paid = past || (due <= today && !late)
      if (!paid && !past && !late) continue
      entries.push(
        entry(item.kind, item.account, item.description, item.amount_cents / 100, due, paid ? (past ? due : today) : null, {
          client: item.client_id ?? undefined,
          recurrence: item.id,
          period,
          fee: item.kind === "income" ? 3.49 : 0,
          category: item.category ?? undefined,
        })
      )
    }
  }
  // Pontuais: projetos, mídia e impostos.
  entries.push(
    entry("income", "client_revenue", "Site institucional Vela (1ª parcela)", 6000, day(addPeriods(current, -2), 18), day(addPeriods(current, -2), 18), { client: "c-vela", fee: 3.49, category: "Site" }),
    entry("income", "client_revenue", "Identidade visual Studio Norte", 7800, day(addPeriods(current, -1), 22), day(addPeriods(current, -1), 23), { client: "c-norte", fee: 3.49, category: "Marca" }),
    entry("income", "client_revenue", "Site institucional Vela (2ª parcela)", 6000, day(current, 18), null, { client: "c-vela", category: "Site" }),
    entry("expense", "direct_cost", "Banco de imagens", 320, day(addPeriods(current, -1), 8), day(addPeriods(current, -1), 8), { category: "Produção" }),
    entry("expense", "other_expense", "Coffee break do workshop", 410, day(addPeriods(current, -3), 14), day(addPeriods(current, -3), 14)),
    entry("expense", "tax", "DAS de outubro", 1980, day(current, 20), null),
    entry("expense", "tax", "DAS de setembro", 1650, day(addPeriods(current, -1), 20), day(addPeriods(current, -1), 20)),
    entry("expense", "owner_draw", "Pró-labore", 4500, day(addPeriods(current, -1), 30), day(addPeriods(current, -1), 30)),
    entry("expense", "direct_cost", "Impressão do material da Hertmann", 780, day(current, 2), null, { client: "c-hertmann", category: "Produção" })
  )

  const closings = months.slice(0, 4).map((period, index) => ({
    period,
    ledger_balance_cents: (18000 + index * 6200) * 100,
    bank_balance_cents: (18000 + index * 6200) * 100,
    notes: null,
    closed_by: ME,
    closed_at: `${addPeriods(period, 1).slice(0, 8)}04T12:00:00.000Z`,
  }))

  return {
    entries,
    recurrences,
    settings: { ...DEFAULT_SETTINGS, opening_on: opening, opening_balance_cents: 1500000, tax_rate_confirmed: true },
    closings,
  }
}

/* Comercial */

function deals(today: DateKey): Deal[] {
  const deal = (
    id: string,
    title: string,
    stage: DealStage,
    reached: DealStage,
    source: LeadSource,
    openedDays: number,
    recurring: number,
    extra: { oneTime?: number; client?: string; closedDays?: number; expectedDays?: number; probability?: number } = {}
  ): Deal => ({
    id,
    title,
    client_id: extra.client ?? null,
    company: title.split(" — ")[0] ?? title,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    source,
    service: "Social media",
    stage,
    reached_stage: reached,
    owner_id: ME,
    recurring_cents: recurring * 100,
    one_time_cents: (extra.oneTime ?? 0) * 100,
    term_months: 12,
    probability: extra.probability ?? null,
    opened_on: addDaysToKey(today, openedDays),
    expected_close_on: extra.expectedDays === undefined ? null : addDaysToKey(today, extra.expectedDays),
    proposal_sent_on: null,
    closed_on: extra.closedDays === undefined ? null : addDaysToKey(today, extra.closedDays),
    lost_reason: stage === "lost" ? "Preço" : null,
    project_id: null,
    recurrence_id: null,
    notes: null,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    deal("d1", "Hertmann Móveis — social media", "won", "won", "referral", -70, 5200, { client: "c-hertmann", closedDays: -48 }),
    deal("d2", "Lume Odontologia — social media", "won", "won", "instagram", -50, 1900, { client: "c-lume", closedDays: -25 }),
    deal("d3", "Padaria Grão — social e tráfego", "negotiation", "negotiation", "instagram", -20, 3200, { expectedDays: 12 }),
    deal("d4", "Clínica Bem — site", "proposal", "proposal", "website", -12, 0, { oneTime: 9000, expectedDays: 20 }),
    deal("d5", "Ótica Lince — social media", "contact", "contact", "referral", -6, 2600, { expectedDays: 35 }),
    deal("d6", "Bistrô Sal — tráfego pago", "lead", "lead", "google", -3, 1800),
    deal("d7", "Ateliê Fio — identidade", "lost", "proposal", "instagram", -40, 0, { oneTime: 6500, closedDays: -15 }),
    deal("d8", "Construtora Eixo — social", "lead", "lead", "linkedin", -2, 4000),
  ]
}

/* Operação */

function projects(today: DateKey): Project[] {
  const base = vitrineWorkspace(today).projects
  return [
    ...base,
    { ...base[0]!, id: "p-hertmann", name: "Catálogo de verão Hertmann", client_id: "c-hertmann", pinned: false, due_on: addDaysToKey(today, -4) },
  ]
}

function reviews(today: DateKey): ClientReview[] {
  const current = periodOf(today)
  const review = (id: string, client: string, health: ClientReview["health"], period: DateKey): ClientReview => ({
    id,
    client_id: client,
    period,
    health,
    checklist: [],
    notes: null,
    done: true,
    done_at: STAMP,
    done_by: ME,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    review("rv1", "c-aurora", "healthy", addPeriods(current, -1)),
    review("rv2", "c-norte", "attention", addPeriods(current, -1)),
    review("rv3", "c-vela", "healthy", addPeriods(current, -1)),
    review("rv4", "c-hertmann", "at_risk", addPeriods(current, -1)),
  ]
}

export function gestaoMetricsSource(today: DateKey): MetricsSource {
  return {
    finance: gestaoFinance(today),
    deals: deals(today),
    tasks: vitrineTasks(today),
    projects: projects(today),
    clients: clientDetails(today),
    reviews: reviews(today),
  }
}

/* Metas */

export function gestaoGoals(today: DateKey): { objectives: Objective[]; keyResults: KeyResult[] } {
  const year = Number(today.slice(0, 4))
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3)
  const qStart = `${year}-${String(quarter * 3 + 1).padStart(2, "0")}-01`
  const qEnd = addDaysToKey(addPeriods(qStart, 3), -1)
  const objective = (id: string, title: string, area: TaskArea | null, startsOn: DateKey, endsOn: DateKey, description: string | null = null): Objective => ({
    id,
    title,
    description,
    area,
    owner_id: ME,
    starts_on: startsOn,
    ends_on: endsOn,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  const kr = (
    id: string,
    objectiveId: string,
    title: string,
    metric: string | null,
    unit: MetricUnit,
    target: number,
    position: number,
    extra: { baseline?: number; manual?: number } = {}
  ): KeyResult => ({
    id,
    objective_id: objectiveId,
    title,
    metric,
    client_id: null,
    unit,
    target_value: target,
    baseline_value: extra.baseline ?? null,
    manual_value: extra.manual ?? null,
    position,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return {
    objectives: [
      objective("o1", "Crescer a receita recorrente com folga", "finance", qStart, qEnd, "Chegar ao fim do ano com o caixa mínimo e o pró-labore cheio."),
      objective("o2", "Entregar no prazo, sempre", "operations", qStart, qEnd),
      objective("o3", "Abrir a frente de sites", "commercial", addPeriods(qStart, 3), addDaysToKey(addPeriods(qStart, 6), -1)),
      objective("o4", "Organizar a casa", "operations", addPeriods(qStart, -3), addDaysToKey(qStart, -1)),
    ],
    keyResults: [
      kr("k1", "o1", "MRR de R$ 20 mil", "mrr", "money", 2000000, 0, { baseline: 1050000 }),
      kr("k2", "o1", "Margem de contribuição acima de 55%", "contribution_margin", "percent", 55, 1),
      kr("k3", "o1", "Nenhum recebível em atraso", null, "count", 0, 2, { baseline: 3, manual: 1 }),
      kr("k4", "o2", "Tarefas atrasadas abaixo de 3", "tasks_overdue", "count", 2, 0, { baseline: 8 }),
      kr("k5", "o2", "NPS dos clientes 9+", null, "number", 9, 1, { baseline: 7, manual: 8.4 }),
      kr("k6", "o3", "Três sites vendidos", null, "count", 3, 0, { manual: 0 }),
      kr("k7", "o4", "Processos principais documentados", null, "count", 10, 0, { manual: 10 }),
    ],
  }
}

/* Decisões */

export function gestaoDecisions(today: DateKey): Decision[] {
  const decision = (
    id: string,
    title: string,
    days: number,
    extra: { context?: string; status?: Decision["status"]; area?: TaskArea; client?: string; project?: string; meeting?: string } = {}
  ): Decision => ({
    id,
    title,
    context: extra.context ?? null,
    decided_on: addDaysToKey(today, days),
    status: extra.status ?? "active",
    area: extra.area ?? null,
    client_id: extra.client ?? null,
    project_id: extra.project ?? null,
    meeting_id: extra.meeting ?? null,
    created_by: ME,
    created_at: STAMP,
    updated_at: STAMP,
  })
  return [
    decision("dc1", "Aprovação de posts pelo portal, não mais pelo WhatsApp", -1, {
      area: "clients",
      meeting: "m1",
      context: "O WhatsApp perdia o histórico e as versões. A partir de novembro, todo post vai para aprovação no portal.",
    }),
    decision("dc2", "Paleta final do rebranding em azul-petróleo", -3, { client: "c-norte", project: "p-marca", area: "brand" }),
    decision("dc3", "Fee mínimo de R$ 1.900 para social media", -9, {
      area: "commercial",
      context: "Abaixo disso a margem de contribuição fica menor que 40%. Clientes antigos mantêm o valor até a renovação.",
    }),
    decision("dc4", "Weekly passa para segunda às 10h", -16, { area: "operations", meeting: "m2" }),
    decision("dc5", "Reels sempre com legenda embutida", -22, { client: "c-aurora", area: "clients" }),
    decision("dc6", "Pró-labore só depois do caixa mínimo", -35, { area: "finance" }),
    decision("dc7", "Entregas às sextas até 15h", -60, { area: "operations", status: "revoked", context: "Trocada pela entrega no dia combinado com cada cliente." }),
  ]
}

export function gestaoMeetings(today: DateKey): { id: string; occurs_on: DateKey }[] {
  return [
    { id: "m1", occurs_on: addDaysToKey(today, -1) },
    { id: "m2", occurs_on: addDaysToKey(today, -16) },
  ]
}

/* Processos */

export function gestaoDocs(today: DateKey): DocSummary[] {
  const doc = (
    id: string,
    title: string,
    kind: DocSummary["kind"],
    status: DocSummary["status"],
    area: TaskArea | null,
    summary: string | null,
    editedDays: number,
    extra: { client?: string; pinned?: boolean; review?: number; nextReview?: number; owner?: string } = {}
  ): DocSummary => {
    const edited = `${addDaysToKey(today, editedDays)}T14:00:00.000Z`
    return {
      id,
      title,
      kind,
      status,
      area,
      client_id: extra.client ?? null,
      owner_id: extra.owner ?? ME,
      summary,
      review_every_months: extra.review ?? null,
      reviewed_on: extra.review ? addDaysToKey(today, editedDays) : null,
      next_review_on: extra.nextReview === undefined ? null : addDaysToKey(today, extra.nextReview),
      pinned: extra.pinned ?? false,
      created_by: ME,
      updated_by: ME,
      created_at: STAMP,
      updated_at: edited,
      content_updated_at: edited,
      content_updated_by: ME,
    }
  }
  return [
    doc("dp1", "Como funciona a Boop", "guide", "active", "operations", "O jeito Boop de trabalhar, para quem chega.", -12, { pinned: true, review: 6, nextReview: 160 }),
    doc("dp2", "Onboarding de cliente", "checklist", "active", "clients", "Do contrato assinado ao primeiro post publicado.", -4, { pinned: true, review: 3, nextReview: 80 }),
    doc("dp3", "Aprovação de conteúdo", "process", "review", "clients", "Como o post vai do roteiro à aprovação no portal.", -95, { review: 3, nextReview: -5, owner: "u-bia" }),
    doc("dp4", "Proposta comercial", "process", "active", "commercial", "Da reunião de diagnóstico à proposta enviada.", -20, { review: 6, nextReview: 150 }),
    doc("dp5", "Faturamento e cobrança", "process", "active", "finance", "Quando e como cobrar, e o que fazer no atraso.", -30, { review: 6, nextReview: 140 }),
    doc("dp6", "Política de prazos e retrabalho", "policy", "draft", "operations", "Até onde vai uma rodada de ajustes.", -2),
    doc("dp7", "Tom de voz da Boop", "guide", "active", "brand", null, -45),
    doc("dp8", "Estudo de persona — Hertmann", "guide", "active", "clients", "Quem compra móveis planejados em Curitiba.", -8, { client: "c-hertmann", owner: "u-bia" }),
    doc("dp9", "Acessos e ferramentas", "checklist", "active", "technology", "Onde ficam as senhas e quem tem acesso.", -60, { review: 12, nextReview: 300, owner: "u-leo" }),
  ]
}

export function gestaoDoc(today: DateKey): Doc {
  const summary = gestaoDocs(today)[1]!
  const text = (value: string) => [{ type: "text", text: value, styles: {} }]
  const block = (id: string, type: string, content: string, props: Record<string, unknown> = {}) => ({ id, type, props, content: text(content), children: [] })
  return {
    ...summary,
    content: [
      block("b1", "heading", "Antes do primeiro dia", { level: 2 }),
      block("b2", "paragraph", "Assim que o contrato for assinado, o cliente recebe as boas-vindas e o acesso ao portal. A ideia é que, na primeira semana, ele já veja a Boop trabalhando."),
      block("b3", "checkListItem", "Enviar o e-mail de boas-vindas com o acesso ao portal", { checked: true }),
      block("b4", "checkListItem", "Criar o canal do cliente em Comunicações", { checked: true }),
      block("b5", "checkListItem", "Agendar a reunião de diagnóstico", { checked: false }),
      block("b6", "heading", "Reunião de diagnóstico", { level: 2 }),
      block("b7", "paragraph", "Uma hora, com o dono do negócio. Saímos com a persona, o tom de voz e as três metas do trimestre."),
      block("b8", "bulletListItem", "Quem é o cliente do cliente (persona)"),
      block("b9", "bulletListItem", "O que já funcionou e o que não funcionou"),
      block("b10", "bulletListItem", "Acessos: Instagram, Meta Business e Google"),
      block("b11", "heading", "Primeiro mês", { level: 2 }),
      block("b12", "checkListItem", "Estratégia de conteúdo do mês aprovada", { checked: false }),
      block("b13", "checkListItem", "Primeiros 8 posts no calendário", { checked: false }),
    ],
  }
}

export function gestaoDocVersions(today: DateKey): DocVersion[] {
  return [
    { id: "v1", doc_id: "dp2", title: "Onboarding de cliente", saved_by: "u-bia", saved_at: `${addDaysToKey(today, -4)}T11:20:00.000Z` },
    { id: "v2", doc_id: "dp2", title: "Onboarding de cliente", saved_by: ME, saved_at: `${addDaysToKey(today, -18)}T16:05:00.000Z` },
  ]
}
