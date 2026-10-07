import type {
  ClientHealth,
  DocKind,
  DocStatus,
  EventType,
  MeetingStatus,
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
