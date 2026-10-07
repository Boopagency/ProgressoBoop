import { isDateKey } from "@/lib/dates"
import { isClientHealth } from "@/lib/labels"
import type { ClientHealth, DateKey, ReviewCheckItem } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Validação do que chega do cliente nas Server Actions dos Clientes. A
 * existência das pessoas é garantida pelas chaves estrangeiras.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export const NAME_MAX = 80
export const SERVICE_MAX = 40
export const SERVICES_MAX = 12
export const NOTES_MAX = 5000
export const REVIEW_NOTES_MAX = 20000
const CHECKLIST_MAX = 30
const LABEL_MAX = 200

export interface ClientInput {
  name: string
  owner_id: string | null
  services: string[]
  since: DateKey | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  review_day: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return undefined
  const text = value.trim()
  if (text.length > max) return undefined
  return text || null
}

export function parseClientInput(raw: unknown): Parsed<ClientInput> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }

  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : ""
  if (!name) return { ok: false, error: "Dê um nome ao cliente." }
  if (name.length > NAME_MAX) return { ok: false, error: "Nome muito longo." }

  const ownerId = raw.owner_id ?? null
  if (ownerId !== null && !isUuid(ownerId)) return { ok: false, error: "Responsável inválido." }

  if (!Array.isArray(raw.services)) return { ok: false, error: "Frentes inválidas." }
  const services: string[] = []
  for (const item of raw.services) {
    if (typeof item !== "string") return { ok: false, error: "Frentes inválidas." }
    const service = item.replace(/\s+/g, " ").trim()
    if (!service) continue
    if (service.length > SERVICE_MAX) return { ok: false, error: "Nome de frente muito longo." }
    if (!services.some((existing) => existing.toLocaleLowerCase("pt-BR") === service.toLocaleLowerCase("pt-BR"))) {
      services.push(service)
    }
  }
  if (services.length > SERVICES_MAX) return { ok: false, error: `No máximo ${SERVICES_MAX} frentes.` }

  const since = raw.since ?? null
  if (since !== null && !isDateKey(since)) return { ok: false, error: "Data inválida." }

  const contactName = optionalText(raw.contact_name, 120)
  const contactEmail = optionalText(raw.contact_email, 200)
  const contactPhone = optionalText(raw.contact_phone, 40)
  const notes = optionalText(raw.notes, NOTES_MAX)
  if (contactName === undefined || contactEmail === undefined || contactPhone === undefined) {
    return { ok: false, error: "Contato inválido ou muito longo." }
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, error: "E-mail do contato inválido." }
  }
  if (notes === undefined) return { ok: false, error: "Observações muito longas." }

  const reviewDay = raw.review_day ?? null
  if (reviewDay !== null && !(Number.isInteger(reviewDay) && (reviewDay as number) >= 1 && (reviewDay as number) <= 28)) {
    return { ok: false, error: "O dia da revisão vai de 1 a 28." }
  }

  return {
    ok: true,
    value: {
      name,
      owner_id: ownerId as string | null,
      services,
      since: since as DateKey | null,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      notes,
      review_day: reviewDay as number | null,
    },
  }
}

export interface ReviewPatch {
  health?: ClientHealth | null
  checklist?: ReviewCheckItem[]
  notes?: string | null
}

export function parseReviewPatch(raw: unknown): Parsed<ReviewPatch> {
  if (!isRecord(raw)) return { ok: false, error: "Dados inválidos." }
  const patch: ReviewPatch = {}

  if ("health" in raw) {
    if (raw.health !== null && !isClientHealth(raw.health)) return { ok: false, error: "Saúde inválida." }
    patch.health = raw.health
  }
  if ("checklist" in raw) {
    const list = raw.checklist
    if (!Array.isArray(list) || list.length > CHECKLIST_MAX) return { ok: false, error: "Checklist inválido." }
    const items: ReviewCheckItem[] = []
    for (const item of list) {
      if (
        !isRecord(item) ||
        typeof item.key !== "string" ||
        typeof item.label !== "string" ||
        typeof item.done !== "boolean" ||
        item.key.length > 60 ||
        item.label.length > LABEL_MAX
      ) {
        return { ok: false, error: "Checklist inválido." }
      }
      items.push({ key: item.key, label: item.label, done: item.done })
    }
    patch.checklist = items
  }
  if ("notes" in raw) {
    if (raw.notes !== null && typeof raw.notes !== "string") return { ok: false, error: "Texto inválido." }
    const notes = (raw.notes ?? "").trim()
    if (notes.length > REVIEW_NOTES_MAX) return { ok: false, error: "Notas muito longas." }
    patch.notes = notes || null
  }

  return { ok: true, value: patch }
}

/** Mês de referência vindo do cliente: "yyyy-MM-01". */
export function isPeriod(value: unknown): value is DateKey {
  return isDateKey(value) && (value as string).endsWith("-01")
}
