import type { EventType, TaskArea, TaskPriority, TaskStatus } from "@/lib/types"

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
