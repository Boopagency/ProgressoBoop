/**
 * Tipos de domínio. Espelham o schema do Supabase
 * (supabase/migrations), com colunas em snake_case como o banco devolve.
 */

export type TaskStatus = "todo" | "doing" | "done"
export type TaskPriority = "low" | "normal" | "high"
export type TaskArea =
  | "commercial"
  | "finance"
  | "operations"
  | "brand"
  | "technology"
  | "clients"
export type EventType = "meeting" | "internal" | "delivery"
/** Regra de recorrência no formato RFC 5545. Nesta versão, só semanal. */
export type RecurrenceRule = "FREQ=WEEKLY"
export type MeetingStatus = "scheduled" | "done" | "canceled"
/** Assunto (pauta trazida pela equipe) ou combinado (o que ficou decidido). */
export type MeetingItemKind = "topic" | "agreement"
export type DocKind = "process" | "checklist" | "policy" | "guide"
/** Rascunho, Em vigor ou Revisar. */
export type DocStatus = "draft" | "active" | "review"
/** Semáforo do cliente: Saudável, Atenção ou Em risco. */
export type ClientHealth = "healthy" | "attention" | "at_risk"
/** Planejado, Em andamento, Pausado, Concluído ou Cancelado. */
export type ProjectStatus = "planned" | "active" | "paused" | "done" | "canceled"
/** Em vigor ou Revogada. */
export type DecisionStatus = "active" | "revoked"
/** Atualização, Pedido, Aprovação, Feedback ou Outro. */
export type CommunicationKind = "update" | "request" | "approval" | "feedback" | "other"
export type CommunicationChannel = "whatsapp" | "email" | "call" | "meeting" | "other"
/** Canal de cliente (um por cliente), interno (por assunto) ou conversa direta. */
export type ChannelKind = "client" | "internal" | "direct"
/** Mensagem, Pedido de ajuste, Aprovação ou aviso do sistema. */
export type MessageKind = "text" | "change_request" | "approval" | "system"
/** Receita ou despesa. */
export type FinanceKind = "income" | "expense"
/**
 * Categoria gerencial (conta) de um lançamento: diz onde ele entra no DRE.
 * Entradas: receita de cliente, outras receitas, aporte de sócio. Saídas:
 * custo direto de cliente, custo fixo, outras despesas, imposto (DAS),
 * pró-labore e reinvestimento.
 */
export type FinanceAccount =
  | "client_revenue"
  | "other_revenue"
  | "owner_contribution"
  | "direct_cost"
  | "fixed_cost"
  | "other_expense"
  | "tax"
  | "owner_draw"
  | "reinvestment"
/** Lead, Em contato, Proposta enviada, Negociação, Ganho ou Perdido. */
export type DealStage = "lead" | "contact" | "proposal" | "negotiation" | "won" | "lost"
export type LeadSource =
  | "referral"
  | "instagram"
  | "website"
  | "google"
  | "linkedin"
  | "whatsapp"
  | "outbound"
  | "event"
  | "existing_client"
  | "other"
/** Unidade de um resultado-chave (dinheiro em centavos; percentual em pontos). */
export type MetricUnit = "money" | "percent" | "count" | "number" | "days"
/** Reels, Carrossel, Estático, Stories, Vídeo, Foto ou Texto. */
export type ContentFormat = "reels" | "carousel" | "static" | "stories" | "video" | "photo" | "text"
export type ContentNetwork = "instagram" | "tiktok" | "linkedin"
/** Conversão, Crescimento, Autoridade, Conexão ou Publi. */
export type ContentIntent = "conversion" | "growth" | "authority" | "connection" | "sponsored"
/** Em produção, Revisão interna, Aguardando cliente, Aprovado, Programado ou Publicado. */
export type ContentStage = "production" | "internal_review" | "client_review" | "approved" | "scheduled" | "published"
/** Situação de uma frente do post (copy, design, vídeo). */
export type ContentFrontStatus =
  | "not_needed"
  | "todo"
  | "in_progress"
  | "missing_material"
  | "in_review"
  | "changes"
  | "done"
/** Frentes de produção de um post. */
export type ContentFront = "copy" | "design" | "video"
export type ActivityAction = "created" | "updated" | "deleted" | "comment"
/** Itens com histórico (comentários: tarefa, projeto, decisão, negócio e post). */
export type ActivityEntityType = "task" | "project" | "decision" | "communication" | "finance" | "recurrence" | "deal" | "content_post"

/** Data sem horário, `yyyy-MM-dd` (formato de colunas `date`). */
export type DateKey = string
/** Instante ISO 8601 (formato de colunas `timestamptz`). */
export type Timestamp = string

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  role: string | null
}

export interface Client {
  id: string
  name: string
  active: boolean
  /** Foto do perfil no bucket `content` (`<client_id>/<arquivo>`). */
  avatar_path: string | null
  /** Perfil do Instagram para o preview do feed: o @ (sem a arroba) e a bio. */
  instagram_handle: string | null
  instagram_bio: string | null
}

/** Cadastro completo do cliente (tela Clientes). */
export interface ClientDetail extends Client {
  /** Responsável da Boop pelo cliente. */
  owner_id: string | null
  /** Frentes de trabalho (ex.: "Social media", "Tráfego pago"). */
  services: string[]
  since: DateKey | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  /** Dia do mês em que a revisão vence; null = sem revisão mensal. */
  review_day: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface ReviewCheckItem {
  key: string
  label: string
  done: boolean
}

/** Revisão mensal de um cliente. */
export interface ClientReview {
  id: string
  client_id: string
  /** Mês de referência (dia 1). */
  period: DateKey
  health: ClientHealth | null
  checklist: ReviewCheckItem[]
  notes: string | null
  done: boolean
  done_at: Timestamp | null
  done_by: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * Projeto: tarefas com começo, prazo, responsável e progresso. Sem cliente, é
 * um projeto interno da Boop (os antigos planos, como "Estruturação da Boop").
 */
export interface Project {
  id: string
  name: string
  client_id: string | null
  owner_id: string | null
  status: ProjectStatus
  /** Modelo usado na criação (ex.: "site"). */
  template: string | null
  description: string | null
  starts_on: DateKey
  due_on: DateKey | null
  /** Em foco: aparece na tela Hoje e na pauta da weekly. */
  pinned: boolean
  completed_at: Timestamp | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Filtros da tela Tarefas com nome, da equipe toda. */
export interface SavedView {
  id: string
  name: string
  /** Parâmetros da URL (ex.: "pessoa=mine&prazo=overdue&ver=quadro"). */
  query: string
  created_by: string
  created_at: Timestamp
}

export interface Task {
  id: string
  title: string
  description: string | null
  /** Vem de `task_assignees`. */
  assignee_ids: string[]
  client_id: string | null
  project_id: string | null
  /** Etapa que o cliente vê no portal, na página do projeto. */
  client_visible: boolean
  area: TaskArea | null
  status: TaskStatus
  priority: TaskPriority
  due_date: DateKey | null
  completed_at: Timestamp | null
  /** Reunião em que a tarefa nasceu (combinado que virou tarefa). */
  meeting_id: string | null
  /** Processo em que a tarefa nasceu (item de checklist que virou tarefa). */
  doc_id: string | null
  /** Revisão mensal de cliente em que a tarefa nasceu (próximo passo). */
  client_review_id: string | null
  /** Comunicação com o cliente em que a tarefa nasceu (ex.: um pedido). */
  communication_id: string | null
  /** Post da Central de Conteúdo em que a tarefa nasceu (uma frente do post). */
  content_post_id: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  event_type: EventType
  start_at: Timestamp
  end_at: Timestamp | null
  all_day: boolean
  recurrence_rule: RecurrenceRule | null
  client_id: string | null
  created_by: string
  created_at: Timestamp
}

/**
 * Registro de uma reunião: uma ocorrência de um evento do tipo "meeting".
 * Título, horário e cliente vêm do evento.
 */
export interface MeetingRecord {
  id: string
  event_id: string
  /** Dia da ocorrência (em São Paulo). */
  occurs_on: DateKey
  status: MeetingStatus
  summary: string | null
  /** Tamanho da transcrição em caracteres (0 = sem transcrição). */
  transcript_length: number
  closed_at: Timestamp | null
  closed_by: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface MeetingItem {
  id: string
  meeting_id: string
  kind: MeetingItemKind
  content: string
  owner_id: string | null
  due_date: DateKey | null
  /** Assunto discutido, ou combinado cumprido quando não virou tarefa. */
  done: boolean
  task_id: string | null
  created_by: string
  created_at: Timestamp
}

/** Processo, checklist, política ou guia (sem o conteúdo, para as listas). */
export interface DocSummary {
  id: string
  title: string
  kind: DocKind
  status: DocStatus
  area: TaskArea | null
  client_id: string | null
  owner_id: string | null
  /** "Para que serve", em uma frase. */
  summary: string | null
  review_every_months: number | null
  reviewed_on: DateKey | null
  next_review_on: DateKey | null
  pinned: boolean
  created_by: string
  updated_by: string | null
  created_at: Timestamp
  updated_at: Timestamp
  /** Última mudança no conteúdo (só o texto; status e propriedades não contam). */
  content_updated_at: Timestamp
  content_updated_by: string | null
}

/** Documento completo: blocos do editor (BlockNote) em JSON. */
export interface Doc extends DocSummary {
  content: unknown[]
}

export interface DocVersion {
  id: string
  doc_id: string
  title: string
  /** Quem deixou o documento assim, e quando. */
  saved_by: string | null
  saved_at: Timestamp
}

/** Decisão: o que ficou definido, por quê e de onde veio. */
export interface Decision {
  id: string
  title: string
  /** Por quê, alternativas descartadas, detalhes. */
  context: string | null
  decided_on: DateKey
  status: DecisionStatus
  area: TaskArea | null
  client_id: string | null
  project_id: string | null
  /** Reunião em que foi decidida. */
  meeting_id: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** O que foi falado com um cliente. */
export interface Communication {
  id: string
  client_id: string
  project_id: string | null
  kind: CommunicationKind
  channel: CommunicationChannel
  summary: string
  details: string | null
  occurred_on: DateKey
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Canal de conversa da equipe (Comunicações). */
export interface Channel {
  id: string
  kind: ChannelKind
  /** Só nos canais de cliente. */
  client_id: string | null
  /** "Alterações – <cliente>" ou o assunto; vazio na conversa direta. */
  name: string | null
  archived: boolean
  created_by: string | null
  created_at: Timestamp
}

/** Mensagem de um canal. No canal de cliente, pode falar de um post. */
export interface Message {
  id: string
  channel_id: string
  post_id: string | null
  /** Conta do Auth (na fase 3, também a do cliente); vazio se a conta saiu. */
  author_id: string | null
  kind: MessageKind
  body: string
  /** Pedido de ajuste resolvido: quando e por quem. */
  resolved_at: Timestamp | null
  resolved_by: string | null
  /** Tarefa em que o pedido virou. */
  task_id: string | null
  created_at: Timestamp
  edited_at: Timestamp | null
}

/** Lançamento de receita ou despesa (avulso ou um mês de uma recorrência). */
export interface FinanceEntry {
  id: string
  kind: FinanceKind
  /** Categoria gerencial (onde entra no DRE). */
  account: FinanceAccount
  description: string
  /** Valor bruto em centavos. */
  amount_cents: number
  /** Taxa do gateway (Asaas) em centavos. */
  fee_cents: number
  due_on: DateKey
  /** Recebido (receita) ou pago (despesa) neste dia. */
  paid_on: DateKey | null
  /** Mês de uma recorrência que não vale (ex.: sem cobrança). */
  skipped: boolean
  /** Frente (receitas) ou subcategoria (despesas), livre. */
  category: string | null
  client_id: string | null
  project_id: string | null
  recurrence_id: string | null
  /** Mês da recorrência (dia 1). */
  period: DateKey | null
  notes: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Receita ou despesa mensal (fee, assinatura). */
export interface FinanceRecurrence {
  id: string
  kind: FinanceKind
  account: FinanceAccount
  description: string
  amount_cents: number
  /** Dia do vencimento; em meses mais curtos, o último dia. */
  day_of_month: number
  category: string | null
  client_id: string | null
  project_id: string | null
  /** Primeiro e último mês (dia 1); sem fim = continua. */
  starts_on: DateKey
  ends_on: DateKey | null
  notes: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Premissas do financeiro (aba PARÂMETROS da planilha). Percentuais em pontos-base. */
export interface FinanceSettings {
  tax_rate_bps: number
  tax_rate_confirmed: boolean
  /** Caixa mínimo em meses de custo fixo. */
  reserve_months: number
  reserve_share_bps: number
  reinvest_share_bps: number
  partners: number
  owner_draw_target_cents: number
  opening_balance_cents: number
  /** Mês (dia 1) a partir do qual o saldo em conta é contado. */
  opening_on: DateKey
  contract_alert_days: number
  updated_by: string | null
  updated_at: Timestamp
}

/** Mês fechado: conferido com o extrato. */
export interface FinanceClosing {
  period: DateKey
  ledger_balance_cents: number
  bank_balance_cents: number
  notes: string | null
  closed_by: string
  closed_at: Timestamp
}

/** Negócio do funil comercial. */
export interface Deal {
  id: string
  title: string
  client_id: string | null
  company: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  source: LeadSource
  service: string | null
  stage: DealStage
  /** Etapa mais avançada já alcançada (o funil conta por ela). */
  reached_stage: DealStage
  owner_id: string | null
  /** Valor mensal (fee) em centavos. */
  recurring_cents: number
  /** Valor pontual (projeto, setup) em centavos. */
  one_time_cents: number
  /** Duração prevista do contrato em meses; null = sem prazo. */
  term_months: number | null
  /** Chance de fechar (%); null = a padrão da etapa. */
  probability: number | null
  opened_on: DateKey
  expected_close_on: DateKey | null
  proposal_sent_on: DateKey | null
  closed_on: DateKey | null
  lost_reason: string | null
  project_id: string | null
  recurrence_id: string | null
  notes: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Objetivo (OKR) com período. */
export interface Objective {
  id: string
  title: string
  description: string | null
  area: TaskArea | null
  owner_id: string | null
  starts_on: DateKey
  ends_on: DateKey
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Resultado-chave: indicador do sistema (automático) ou valor manual. */
export interface KeyResult {
  id: string
  objective_id: string
  title: string
  /** Chave do indicador no catálogo; null = manual. */
  metric: string | null
  client_id: string | null
  unit: MetricUnit
  target_value: number
  baseline_value: number | null
  manual_value: number | null
  position: number
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Slide de um carrossel: texto e imagem (caminho no bucket `content`). */
export interface ContentSlide {
  text: string
  image_path: string | null
}

/** Post da Central de Conteúdo (social media de um cliente). */
export interface ContentPost {
  id: string
  client_id: string
  project_id: string | null
  title: string
  format: ContentFormat
  /** Pelo menos uma. */
  networks: ContentNetwork[]
  intents: ContentIntent[]
  /** Dia e horário (São Paulo) previstos para a publicação. */
  publish_on: DateKey | null
  /** `HH:mm:ss`, como o banco devolve colunas `time`. */
  publish_time: string | null
  stage: ContentStage
  copy_status: ContentFrontStatus
  design_status: ContentFrontStatus
  video_status: ContentFrontStatus
  owner_id: string | null
  /** Conteúdo/ideia do post. */
  brief: string | null
  /** Orientação de design ou de vídeo. */
  design_notes: string | null
  /** Roteiro (reels, vídeo, stories). */
  script: string | null
  /** Até 20. */
  slides: ContentSlide[]
  caption: string | null
  drive_url: string | null
  /** Capa no bucket `content` (`<client_id>/<arquivo>`). */
  cover_path: string | null
  /** Fixado no topo do feed. */
  pinned: boolean
  /** Quando virou publicado. */
  published_at: Timestamp | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Ideia ou referência do banco de ideias de um cliente. */
export interface ContentIdea {
  id: string
  client_id: string
  title: string
  notes: string | null
  format: ContentFormat | null
  reference_url: string | null
  /** Post em que a ideia virou. */
  post_id: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

/** Registro do histórico ou comentário. */
export interface ActivityEntry {
  id: string
  entity_type: ActivityEntityType
  entity_id: string
  /** Título do item no momento (vale também para itens excluídos). */
  entity_title: string
  project_id: string | null
  client_id: string | null
  action: ActivityAction
  /** Campos alterados: { campo: [antes, depois] }. */
  changes: Record<string, [unknown, unknown]>
  body: string | null
  actor_id: string | null
  created_at: Timestamp
  edited_at: Timestamp | null
}

/** Usuário autenticado (perfil + e-mail da conta). */
export interface SessionUser {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
}

/** Retorno padrão das Server Actions. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string }
