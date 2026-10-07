import type {
  ClientHealth,
  CommunicationChannel,
  CommunicationKind,
  DealStage,
  DecisionStatus,
  DocKind,
  DocStatus,
  EventType,
  FinanceAccount,
  FinanceKind,
  LeadSource,
  MeetingStatus,
  MetricUnit,
  ProjectStatus,
  TaskArea,
  TaskPriority,
  TaskStatus,
} from "@/lib/types"

/** Códigos em inglês (banco) → rótulos em português (interface). */

export const TASK_STATUSES = ["todo", "doing", "done"] as const satisfies readonly TaskStatus[]
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
}

export const TASK_PRIORITIES = ["high", "normal", "low"] as const satisfies readonly TaskPriority[]
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "Alta",
  normal: "Normal",
  low: "Baixa",
}

export const TASK_AREAS = [
  "commercial",
  "finance",
  "operations",
  "brand",
  "technology",
  "clients",
] as const satisfies readonly TaskArea[]
export const TASK_AREA_LABEL: Record<TaskArea, string> = {
  commercial: "Comercial",
  finance: "Financeiro",
  operations: "Operação",
  brand: "Marca",
  technology: "Tecnologia",
  clients: "Clientes",
}

export const EVENT_TYPES = ["meeting", "internal", "delivery"] as const satisfies readonly EventType[]
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  meeting: "Reunião",
  internal: "Evento interno",
  delivery: "Entrega",
}

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Agendada",
  done: "Encerrada",
  canceled: "Cancelada",
}

export const DOC_KINDS = ["process", "checklist", "policy", "guide"] as const satisfies readonly DocKind[]
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  process: "Processo",
  checklist: "Checklist",
  policy: "Política",
  guide: "Guia",
}

export const DOC_STATUSES = ["draft", "active", "review"] as const satisfies readonly DocStatus[]
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Rascunho",
  active: "Em vigor",
  review: "Revisar",
}

export const CLIENT_HEALTHS = ["healthy", "attention", "at_risk"] as const satisfies readonly ClientHealth[]
export const CLIENT_HEALTH_LABEL: Record<ClientHealth, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  at_risk: "Em risco",
}

export const PROJECT_STATUSES = ["planned", "active", "paused", "done", "canceled"] as const satisfies readonly ProjectStatus[]
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planejado",
  active: "Em andamento",
  paused: "Pausado",
  done: "Concluído",
  canceled: "Cancelado",
}

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  active: "Em vigor",
  revoked: "Revogada",
}

export const COMMUNICATION_KINDS = ["request", "approval", "feedback", "update", "other"] as const satisfies readonly CommunicationKind[]
export const COMMUNICATION_KIND_LABEL: Record<CommunicationKind, string> = {
  request: "Pedido",
  approval: "Aprovação",
  feedback: "Feedback",
  update: "Atualização",
  other: "Outro",
}

export const COMMUNICATION_CHANNELS = ["whatsapp", "email", "call", "meeting", "other"] as const satisfies readonly CommunicationChannel[]
export const COMMUNICATION_CHANNEL_LABEL: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  call: "Ligação",
  meeting: "Reunião",
  other: "Outro canal",
}

export const FINANCE_KIND_LABEL: Record<FinanceKind, string> = {
  income: "Receita",
  expense: "Despesa",
}

/** Categorias gerenciais de entrada e de saída (a mesma lista da planilha). */
export const INCOME_ACCOUNTS = ["client_revenue", "other_revenue", "owner_contribution"] as const satisfies readonly FinanceAccount[]
export const EXPENSE_ACCOUNTS = [
  "direct_cost",
  "fixed_cost",
  "other_expense",
  "tax",
  "owner_draw",
  "reinvestment",
] as const satisfies readonly FinanceAccount[]
export const FINANCE_ACCOUNTS = [...INCOME_ACCOUNTS, ...EXPENSE_ACCOUNTS] as const

export const FINANCE_ACCOUNT_LABEL: Record<FinanceAccount, string> = {
  client_revenue: "Receita de cliente",
  other_revenue: "Outras receitas",
  owner_contribution: "Aporte de sócio",
  direct_cost: "Custo direto de cliente",
  fixed_cost: "Custo fixo",
  other_expense: "Outras despesas",
  tax: "Imposto (DAS)",
  owner_draw: "Pró-labore",
  reinvestment: "Reinvestimento",
}

/** Quando usar e onde aparece (ajuda no formulário). */
export const FINANCE_ACCOUNT_HINT: Record<FinanceAccount, string> = {
  client_revenue: "Mensalidade ou pagamento de cliente. Entra no DRE como receita bruta.",
  other_revenue: "Receita que não é de contrato (palestra, venda avulsa). Receita bruta no DRE.",
  owner_contribution: "Dinheiro que um sócio colocou na empresa. Soma no caixa, não é receita.",
  direct_cost: "Custo ligado a um cliente (hospedagem da loja, freelancer do projeto). Custos diretos no DRE.",
  fixed_cost: "Contabilidade, ferramentas, parcela de equipamentos. Custos fixos no DRE.",
  other_expense: "Gasto avulso, que não se repete. Outras despesas no DRE.",
  tax: "Guia do Simples (DAS). Fora do DRE: o DRE já desconta o imposto pela alíquota.",
  owner_draw: "Pagamento aos sócios. Fora do DRE: é a divisão do resultado.",
  reinvestment: "Gasto pago com a verba de reinvestimento. Fora do DRE.",
}

export function isFinanceAccount(value: unknown): value is FinanceAccount {
  return FINANCE_ACCOUNTS.includes(value as FinanceAccount)
}

/** Receita ou despesa, pela conta. */
export function accountKind(account: FinanceAccount): FinanceKind {
  return (INCOME_ACCOUNTS as readonly FinanceAccount[]).includes(account) ? "income" : "expense"
}

export const DEAL_STAGES = ["lead", "contact", "proposal", "negotiation", "won", "lost"] as const satisfies readonly DealStage[]
/** Etapas em aberto, na ordem do funil. */
export const OPEN_DEAL_STAGES = ["lead", "contact", "proposal", "negotiation"] as const satisfies readonly DealStage[]
export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  lead: "Lead",
  contact: "Em contato",
  proposal: "Proposta enviada",
  negotiation: "Negociação",
  won: "Ganho",
  lost: "Perdido",
}
/** Chance de fechar quando ninguém informa (%). */
export const DEAL_STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 10,
  contact: 20,
  proposal: 40,
  negotiation: 60,
  won: 100,
  lost: 0,
}

export const LEAD_SOURCES = [
  "referral",
  "instagram",
  "website",
  "google",
  "linkedin",
  "whatsapp",
  "outbound",
  "event",
  "existing_client",
  "other",
] as const satisfies readonly LeadSource[]
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  referral: "Indicação",
  instagram: "Instagram",
  website: "Site",
  google: "Google",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  outbound: "Prospecção ativa",
  event: "Evento",
  existing_client: "Cliente da casa",
  other: "Outra",
}

export function isDealStage(value: unknown): value is DealStage {
  return DEAL_STAGES.includes(value as DealStage)
}

export function isLeadSource(value: unknown): value is LeadSource {
  return LEAD_SOURCES.includes(value as LeadSource)
}

export const METRIC_UNITS = ["money", "percent", "count", "number", "days"] as const satisfies readonly MetricUnit[]
export const METRIC_UNIT_LABEL: Record<MetricUnit, string> = {
  money: "Reais",
  percent: "Percentual",
  count: "Quantidade",
  number: "Número",
  days: "Dias",
}

export function isMetricUnit(value: unknown): value is MetricUnit {
  return METRIC_UNITS.includes(value as MetricUnit)
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus)
}

export function isDecisionStatus(value: unknown): value is DecisionStatus {
  return value === "active" || value === "revoked"
}

export function isCommunicationKind(value: unknown): value is CommunicationKind {
  return COMMUNICATION_KINDS.includes(value as CommunicationKind)
}

export function isCommunicationChannel(value: unknown): value is CommunicationChannel {
  return COMMUNICATION_CHANNELS.includes(value as CommunicationChannel)
}

export function isFinanceKind(value: unknown): value is FinanceKind {
  return value === "income" || value === "expense"
}

export function isClientHealth(value: unknown): value is ClientHealth {
  return CLIENT_HEALTHS.includes(value as ClientHealth)
}

export function isDocKind(value: unknown): value is DocKind {
  return DOC_KINDS.includes(value as DocKind)
}

export function isDocStatus(value: unknown): value is DocStatus {
  return DOC_STATUSES.includes(value as DocStatus)
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority)
}

export function isTaskArea(value: unknown): value is TaskArea {
  return TASK_AREAS.includes(value as TaskArea)
}

export function isEventType(value: unknown): value is EventType {
  return EVENT_TYPES.includes(value as EventType)
}
