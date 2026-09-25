import { isDateKey, isTimeLabel, zonedTimeToInstant } from "@/lib/dates"
import { isEventType } from "@/lib/labels"
import type { DateKey, EventRecurrence, EventType, Timestamp } from "@/lib/types"

/**
 * Evento como o formulário envia: data e horários de parede em São Paulo.
 * O servidor converte para instantes (start_at/end_at).
 */
export interface EventInput {
  title: string
  description: string | null
  event_type: EventType
  date: DateKey
  all_day: boolean
  start_time: string | null
  end_time: string | null
  recurrence: EventRecurrence | null
  client_id: string | null
}

export interface EventRecord {
  title: string
  description: string | null
  event_type: EventType
  start_at: Timestamp
  end_at: Timestamp | null
  all_day: boolean
  recurrence: EventRecurrence | null
  client_id: string | null
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseEventInput(raw: unknown): Parsed<EventRecord> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }

  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  if (!title) return { ok: false, error: "Dê um título ao evento." }
  if (title.length > 200) return { ok: false, error: "Título muito longo." }

  if (raw.description !== null && typeof raw.description !== "string") {
    return { ok: false, error: "Descrição inválida." }
  }
  const description = raw.description?.trim() || null
  if (description && description.length > 5000) return { ok: false, error: "Descrição muito longa." }

  if (!isEventType(raw.event_type)) return { ok: false, error: "Tipo inválido." }
  if (!isDateKey(raw.date)) return { ok: false, error: "Data inválida." }
  if (typeof raw.all_day !== "boolean") return { ok: false, error: "Dados inválidos." }
  if (raw.recurrence !== null && raw.recurrence !== "weekly") {
    return { ok: false, error: "Recorrência inválida." }
  }
  if (raw.client_id !== null && (typeof raw.client_id !== "string" || !raw.client_id)) {
    return { ok: false, error: "Cliente inválido." }
  }

  let startAt: Timestamp
  let endAt: Timestamp | null = null
  if (raw.all_day) {
    startAt = zonedTimeToInstant(raw.date, "00:00")
  } else {
    if (!isTimeLabel(raw.start_time)) return { ok: false, error: "Informe o horário de início." }
    startAt = zonedTimeToInstant(raw.date, raw.start_time)
    if (raw.end_time !== null && raw.end_time !== undefined && raw.end_time !== "") {
      if (!isTimeLabel(raw.end_time)) return { ok: false, error: "Horário de término inválido." }
      if (raw.end_time <= raw.start_time) {
        return { ok: false, error: "O término precisa ser depois do início." }
      }
      endAt = zonedTimeToInstant(raw.date, raw.end_time)
    }
  }

  return {
    ok: true,
    value: {
      title,
      description,
      event_type: raw.event_type,
      start_at: startAt,
      end_at: endAt,
      all_day: raw.all_day,
      recurrence: raw.recurrence,
      client_id: raw.client_id,
    },
  }
}
