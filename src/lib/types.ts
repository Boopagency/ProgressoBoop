/**
 * Tipos de domínio. Espelham o schema proposto para o Supabase
 * (docs/ARQUITETURA.md), com colunas em snake_case como o banco devolve.
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
export type EventRecurrence = "weekly"

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
  recurrence: EventRecurrence | null
  client_id: string | null
  created_by: string
  created_at: Timestamp
}

export interface WeeklyDecision {
  id: string
  content: string
  /** Sempre uma segunda-feira. */
  week_start: DateKey
  created_by: string
  created_at: Timestamp
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
