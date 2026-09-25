import { isDateKey } from "@/lib/dates"
import { isTaskArea, isTaskPriority, isTaskStatus } from "@/lib/labels"
import type { DateKey, TaskArea, TaskPriority, TaskStatus } from "@/lib/types"

/** Campos editáveis de uma tarefa. */
export interface TaskInput {
  title: string
  description: string | null
  assignee_ids: string[]
  due_date: DateKey | null
  area: TaskArea | null
  client_id: string | null
  plan_id: string | null
  priority: TaskPriority
  status: TaskStatus
}

export type TaskPatch = Partial<TaskInput>

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const TITLE_MAX = 200
const DESCRIPTION_MAX = 5000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === "string" && value.length > 0) return value
  return undefined
}

/**
 * Valida o formato de uma alteração vinda do cliente. Server Actions recebem
 * dados de qualquer origem, então nada é confiado sem checagem. A existência
 * de pessoas, clientes e planos é garantida pelas chaves estrangeiras.
 */
export function parseTaskPatch(raw: unknown): Parsed<TaskPatch> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  const patch: TaskPatch = {}

  if ("title" in raw) {
    if (typeof raw.title !== "string") return { ok: false, error: "Título inválido." }
    const title = raw.title.trim()
    if (!title) return { ok: false, error: "Dê um título à tarefa." }
    if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
    patch.title = title
  }

  if ("description" in raw) {
    if (raw.description !== null && typeof raw.description !== "string") {
      return { ok: false, error: "Descrição inválida." }
    }
    const description = raw.description?.trim() ?? ""
    if (description.length > DESCRIPTION_MAX) return { ok: false, error: "Descrição muito longa." }
    patch.description = description || null
  }

  if ("assignee_ids" in raw) {
    const ids = raw.assignee_ids
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.length > 0)) {
      return { ok: false, error: "Responsáveis inválidos." }
    }
    if (ids.length === 0) return { ok: false, error: "Escolha pelo menos um responsável." }
    patch.assignee_ids = [...new Set(ids as string[])]
  }

  if ("due_date" in raw) {
    if (raw.due_date !== null && !isDateKey(raw.due_date)) {
      return { ok: false, error: "Prazo inválido." }
    }
    patch.due_date = raw.due_date
  }

  if ("area" in raw) {
    if (raw.area !== null && !isTaskArea(raw.area)) return { ok: false, error: "Área inválida." }
    patch.area = raw.area
  }

  if ("client_id" in raw) {
    const clientId = optionalId(raw.client_id)
    if (clientId === undefined) return { ok: false, error: "Cliente inválido." }
    patch.client_id = clientId
  }

  if ("plan_id" in raw) {
    const planId = optionalId(raw.plan_id)
    if (planId === undefined) return { ok: false, error: "Plano inválido." }
    patch.plan_id = planId
  }

  if ("priority" in raw) {
    if (!isTaskPriority(raw.priority)) return { ok: false, error: "Prioridade inválida." }
    patch.priority = raw.priority
  }

  if ("status" in raw) {
    if (!isTaskStatus(raw.status)) return { ok: false, error: "Status inválido." }
    patch.status = raw.status
  }

  return { ok: true, value: patch }
}

/** Criação: título e responsáveis obrigatórios; o resto tem padrão. */
export function parseTaskInput(raw: unknown): Parsed<TaskInput> {
  const parsed = parseTaskPatch(raw)
  if (!parsed.ok) return parsed
  const patch = parsed.value
  if (!patch.title) return { ok: false, error: "Dê um título à tarefa." }
  if (!patch.assignee_ids) return { ok: false, error: "Escolha pelo menos um responsável." }
  return {
    ok: true,
    value: {
      title: patch.title,
      description: patch.description ?? null,
      assignee_ids: patch.assignee_ids,
      due_date: patch.due_date ?? null,
      area: patch.area ?? null,
      client_id: patch.client_id ?? null,
      plan_id: patch.plan_id ?? null,
      priority: patch.priority ?? "normal",
      status: patch.status ?? "todo",
    },
  }
}
