import "server-only"

import { addDaysToKey, todayKey, weekRangeOf } from "@/lib/dates"
import type {
  CalendarEvent,
  Client,
  DateKey,
  Plan,
  Profile,
  Task,
  TaskArea,
  TaskPriority,
  TaskStatus,
  WeeklyDecision,
} from "@/lib/types"

/**
 * Dados iniciais do protótipo (etapa 1).
 *
 * - O plano "Estruturação da Boop" (25 tarefas) é o plano real e vai para o
 *   seed do Supabase na etapa 2.
 * - Os itens marcados como DEMO existem só para exercitar os estados visuais
 *   (atrasadas, concluídas etc.). As datas deles são relativas a hoje.
 */

export interface MockUser {
  id: string
  email: string
}

export interface MockData {
  users: MockUser[]
  profiles: Profile[]
  clients: Client[]
  plans: Plan[]
  tasks: Task[]
  events: CalendarEvent[]
  decisions: WeeklyDecision[]
}

const JABEZ = "user-jabez"
const RENATHA = "user-renatha"
const LEO = "user-leo"
const EVERYONE = [JABEZ, RENATHA, LEO]

const HERTMANN = "client-hertmann"
const VELMONT = "client-velmont"
const HAPUCK = "client-hapuck"
const BOOP = "client-boop"

const PLAN = "plan-estruturacao-2026"

/** Instante ISO para uma data/hora de São Paulo (UTC−3, sem horário de verão). */
function saoPaulo(date: DateKey, time = "09:00"): string {
  return new Date(`${date}T${time}:00-03:00`).toISOString()
}

interface TaskSeed {
  title: string
  assignees: string[]
  due: DateKey
  area: TaskArea
  client?: string
  priority?: TaskPriority
  status?: TaskStatus
  description?: string
  completedAt?: string
  createdAt?: string
  plan?: string
}

function buildTask(seed: TaskSeed, index: number, prefix: string): Task {
  const createdAt = seed.createdAt ?? saoPaulo("2026-09-25", "09:00")
  return {
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    title: seed.title,
    description: seed.description ?? null,
    assignee_ids: seed.assignees,
    client_id: seed.client ?? null,
    plan_id: seed.plan ?? null,
    area: seed.area,
    status: seed.status ?? "todo",
    priority: seed.priority ?? "normal",
    due_date: seed.due,
    completed_at: seed.status === "done" ? (seed.completedAt ?? createdAt) : null,
    created_by: JABEZ,
    created_at: createdAt,
    updated_at: seed.completedAt ?? createdAt,
  }
}

/** Plano real: Estruturação da Boop, de 25/09 a 31/10/2026. */
const PLAN_TASKS: TaskSeed[] = [
  // Semana 0 — 25 a 27/09
  {
    title: "Banco, login e deploy em admin.deumboop.com.br",
    assignees: [JABEZ],
    due: "2026-09-26",
    area: "technology",
    priority: "high",
    status: "doing",
    description:
      "Supabase (Auth + Postgres), login dos três sócios e publicação na Vercel em admin.deumboop.com.br.",
  },
  { title: "Cadastrar as tarefas deste plano", assignees: [JABEZ], due: "2026-09-27", area: "operations" },
  { title: "Criar a conta dos três e testar", assignees: [LEO, RENATHA], due: "2026-09-27", area: "technology" },
  // Semana 1 — 28/09 a 04/10
  {
    title: "Primeira reunião de segunda rodando na ferramenta",
    assignees: EVERYONE,
    due: "2026-09-28",
    area: "operations",
    description: "Conduzir a reunião semanal pela tela Segunda.",
  },
  { title: "Planilha financeira no ar, com setembro lançado", assignees: [LEO], due: "2026-09-30", area: "finance" },
  { title: "Certificado digital e nota fiscal emitida no Asaas", assignees: [LEO], due: "2026-10-02", area: "finance" },
  { title: "Chip e WhatsApp Business da Boop", assignees: [RENATHA], due: "2026-09-30", area: "commercial" },
  {
    title: "Bitwarden, com os acessos da Hertmann e da Velmont migrados",
    assignees: [JABEZ],
    due: "2026-10-02",
    area: "technology",
  },
  { title: "Pasta padrão por cliente no Drive", assignees: [LEO], due: "2026-10-02", area: "operations" },
  {
    title: "Data de reajuste da Hertmann definida e combinada",
    assignees: [JABEZ],
    due: "2026-10-04",
    area: "clients",
    client: HERTMANN,
  },
  // Semana 2 — 05 a 11/10
  { title: "Faixas internas de preço, piso por frente", assignees: [JABEZ, RENATHA], due: "2026-10-07", area: "commercial" },
  { title: "Roteiro de diagnóstico para reuniões", assignees: [RENATHA], due: "2026-10-09", area: "commercial" },
  { title: "Lista de 30 empresas de Curitiba para abordagem", assignees: [RENATHA], due: "2026-10-09", area: "commercial" },
  {
    title: "Proposta e follow-up do WePlay até fechar",
    assignees: [RENATHA],
    due: "2026-10-11",
    area: "commercial",
    priority: "high",
  },
  // Semana 3 — 12 a 18/10
  { title: "Case Velmont", assignees: [JABEZ], due: "2026-10-14", area: "brand", client: VELMONT },
  {
    title: "Calendário editorial da Boop e 4 primeiros vídeos gravados",
    assignees: [JABEZ, RENATHA],
    due: "2026-10-16",
    area: "brand",
    client: BOOP,
  },
  { title: "Google Meu Negócio, área de atendimento", assignees: [RENATHA], due: "2026-10-16", area: "commercial" },
  { title: "Primeiras 10 abordagens da lista feitas", assignees: [RENATHA], due: "2026-10-18", area: "commercial" },
  // Semana 4 — 19 a 25/10
  { title: "Stack padrão de hospedagem documentada", assignees: [JABEZ], due: "2026-10-21", area: "technology" },
  { title: "Checklist de QA de sites", assignees: [JABEZ], due: "2026-10-23", area: "technology" },
  { title: "Site da Boop com case e serviços", assignees: [JABEZ], due: "2026-10-25", area: "brand", client: BOOP },
  { title: "Mais 20 abordagens e 3 diagnósticos marcados", assignees: [RENATHA], due: "2026-10-25", area: "commercial" },
  // Semana 5 — 26 a 31/10
  { title: "Revisão do plano: o que funcionou e o que cortar", assignees: EVERYONE, due: "2026-10-26", area: "operations" },
  { title: "Fechamento de outubro na planilha", assignees: [LEO], due: "2026-10-31", area: "finance" },
  {
    title: "Meta: 2 propostas enviadas, 1 contrato novo fechado",
    assignees: [RENATHA],
    due: "2026-10-31",
    area: "commercial",
    priority: "high",
  },
]

/** DEMO: tarefas avulsas com datas relativas a hoje. */
function demoTasks(today: DateKey): TaskSeed[] {
  const day = (offset: number) => addDaysToKey(today, offset)
  return [
    {
      title: "Enviar relatório de setembro para a Velmont",
      assignees: [JABEZ],
      due: day(-1),
      area: "clients",
      client: VELMONT,
      priority: "high",
      createdAt: saoPaulo(day(-6)),
    },
    {
      title: "Cobrar fatura em aberto da Hapuck Scents",
      assignees: [LEO],
      due: day(-2),
      area: "finance",
      client: HAPUCK,
      createdAt: saoPaulo(day(-7)),
    },
    {
      title: "Revisar entregas da Hertmann",
      assignees: [JABEZ],
      due: day(0),
      area: "clients",
      client: HERTMANN,
      status: "doing",
      priority: "high",
      createdAt: saoPaulo(day(-3)),
    },
    {
      title: "Responder briefing da Hapuck Scents",
      assignees: [RENATHA],
      due: day(0),
      area: "clients",
      client: HAPUCK,
      createdAt: saoPaulo(day(-2)),
    },
    {
      title: "Definir escopo do Boop Admin",
      assignees: [JABEZ],
      due: day(-2),
      area: "technology",
      status: "done",
      completedAt: saoPaulo(day(-2), "18:10"),
      createdAt: saoPaulo(day(-5)),
    },
    {
      title: "Atualizar contrato da Velmont",
      assignees: [LEO],
      due: day(-1),
      area: "finance",
      client: VELMONT,
      status: "done",
      completedAt: saoPaulo(day(-1), "11:40"),
      createdAt: saoPaulo(day(-6)),
    },
    {
      title: "Mapear indicações recebidas em setembro",
      assignees: [RENATHA],
      due: day(-3),
      area: "commercial",
      status: "done",
      completedAt: saoPaulo(day(-3), "16:25"),
      createdAt: saoPaulo(day(-8)),
    },
    {
      title: "Enviar proposta revisada para a Hapuck Scents",
      assignees: [RENATHA, JABEZ],
      due: day(-6),
      area: "commercial",
      client: HAPUCK,
      status: "done",
      completedAt: saoPaulo(day(-7), "17:00"),
      createdAt: saoPaulo(day(-12)),
    },
    {
      title: "Migrar domínio do site da Hertmann",
      assignees: [JABEZ],
      due: day(-8),
      area: "technology",
      client: HERTMANN,
      status: "done",
      completedAt: saoPaulo(day(-8), "15:30"),
      createdAt: saoPaulo(day(-14)),
    },
  ]
}

export function createSeed(now: Date = new Date()): MockData {
  const today = todayKey(now)
  const createdAt = saoPaulo("2026-09-21", "08:00")

  const profiles: Profile[] = [
    { id: JABEZ, full_name: "Jabez", avatar_url: null, role: "Estratégia, tecnologia e operação" },
    { id: RENATHA, full_name: "Renatha", avatar_url: null, role: "Comercial e relacionamento" },
    { id: LEO, full_name: "Léo", avatar_url: null, role: "Administrativo e financeiro" },
  ]

  const clients: Client[] = [
    { id: HERTMANN, name: "Hertmann", active: true },
    { id: VELMONT, name: "Velmont", active: true },
    { id: HAPUCK, name: "Hapuck Scents", active: true },
    { id: BOOP, name: "Boop", active: true },
  ]

  const plans: Plan[] = [
    { id: PLAN, name: "Estruturação da Boop", starts_on: "2026-09-25", ends_on: "2026-10-31" },
  ]

  const tasks: Task[] = [
    ...PLAN_TASKS.map((seed, index) => buildTask({ ...seed, plan: PLAN }, index, "task-plan")),
    ...demoTasks(today).map((seed, index) => buildTask(seed, index, "task-demo")),
  ]

  const events: CalendarEvent[] = [
    {
      id: "event-weekly",
      title: "Reunião semanal da Boop",
      description: "Revisão da semana pela tela Segunda: concluídas, atrasadas e prioridades.",
      event_type: "meeting",
      start_at: saoPaulo("2026-09-21", "07:00"),
      end_at: saoPaulo("2026-09-21", "08:00"),
      all_day: false,
      recurrence: "weekly",
      client_id: null,
      created_by: JABEZ,
      created_at: createdAt,
    },
    // DEMO
    {
      id: "event-demo-hertmann",
      title: "Alinhamento com a Hertmann",
      description: null,
      event_type: "meeting",
      start_at: saoPaulo(addDaysToKey(today, 3), "10:00"),
      end_at: saoPaulo(addDaysToKey(today, 3), "10:45"),
      all_day: false,
      recurrence: null,
      client_id: HERTMANN,
      created_by: JABEZ,
      created_at: createdAt,
    },
    {
      id: "event-demo-velmont",
      title: "Entrega do relatório mensal da Velmont",
      description: null,
      event_type: "delivery",
      start_at: saoPaulo(addDaysToKey(today, 5), "00:00"),
      end_at: null,
      all_day: true,
      recurrence: null,
      client_id: VELMONT,
      created_by: JABEZ,
      created_at: createdAt,
    },
    {
      id: "event-demo-conteudo",
      title: "Planejamento de conteúdo de outubro",
      description: null,
      event_type: "internal",
      start_at: saoPaulo(addDaysToKey(today, 6), "14:00"),
      end_at: saoPaulo(addDaysToKey(today, 6), "15:30"),
      all_day: false,
      recurrence: null,
      client_id: BOOP,
      created_by: RENATHA,
      created_at: createdAt,
    },
  ]

  return {
    users: [
      { id: JABEZ, email: "jabez@deumboop.com.br" },
      { id: RENATHA, email: "renatha@deumboop.com.br" },
      { id: LEO, email: "leo@deumboop.com.br" },
    ],
    profiles,
    clients,
    plans,
    tasks,
    events,
    decisions: demoDecisions(today),
  }
}

/** DEMO: decisões desta semana e da anterior. */
function demoDecisions(today: DateKey): WeeklyDecision[] {
  const monday = weekRangeOf(today).start
  const lastMonday = addDaysToKey(monday, -7)
  return [
    {
      id: "decision-demo-1",
      content: "Priorizar fechamento do WePlay.",
      week_start: monday,
      created_by: RENATHA,
      created_at: saoPaulo(monday, "07:40"),
    },
    {
      id: "decision-demo-2",
      content: "Hertmann precisa ser entregue até sexta.",
      week_start: monday,
      created_by: JABEZ,
      created_at: saoPaulo(monday, "07:45"),
    },
    {
      id: "decision-demo-3",
      content: "Adiar site institucional.",
      week_start: lastMonday,
      created_by: JABEZ,
      created_at: saoPaulo(lastMonday, "07:50"),
    },
  ]
}

