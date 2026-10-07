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

export interface Plan {
  id: string
  name: string
  starts_on: DateKey
  ends_on: DateKey
}

export interface Task {
  id: string
  title: string
  description: string | null
  /** Vem de `task_assignees`. */
  assignee_ids: string[]
  client_id: string | null
  plan_id: string | null
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
