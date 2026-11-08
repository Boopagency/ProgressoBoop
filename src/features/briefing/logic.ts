import { addBusinessDays, isDateKey } from "@/lib/dates"
import type { BriefingStatus, DateKey, Timestamp } from "@/lib/types"

/*
 * Regras do briefing de onboarding (issue #108). Funções puras; o banco
 * (migration `*_briefing.sql`) confere as mesmas regras de novo.
 */

/** Prazo padrão para o cliente responder: 5 dias úteis depois de liberar. */
export const BRIEFING_DUE_BUSINESS_DAYS = 5

/** Ação de aprovação recusada pelo banco (`briefing_pending`) enquanto o briefing do cliente está pendente. */
export const BRIEFING_PENDING_MESSAGE = "Antes de aprovar, termine o briefing. Depois de enviar, as aprovações abrem por aqui."

/** Statuses em que o briefing está liberado e não enviado: o portal só mostra o Briefing. */
export const BRIEFING_OPEN_STATUSES: readonly BriefingStatus[] = ["not_started", "in_progress"]

export function isBriefingOpen(status: BriefingStatus): boolean {
  return BRIEFING_OPEN_STATUSES.includes(status)
}

/**
 * Preparando: a equipe criou o briefing e preenche o que já sabe antes de
 * liberar. O cliente não vê e o portal não trava; o prazo conta ao liberar.
 */
export function isBriefingPreparing(status: BriefingStatus): boolean {
  return status === "preparing"
}

/** Prazo sugerido ao liberar hoje. */
export function defaultBriefingDue(today: DateKey): DateKey {
  return addBusinessDays(today, BRIEFING_DUE_BUSINESS_DAYS)
}

/** Bloco 0: dados que a equipe confere ao liberar e o cliente confirma no portal. */
export interface BriefingIdentification {
  brand_name: string
  contact_name: string
  region: string
  instagram: string
  site: string
}

export const IDENTIFICATION_FIELDS: readonly { key: keyof BriefingIdentification; label: string; placeholder: string; max: number }[] = [
  { key: "brand_name", label: "Nome da marca", placeholder: "Ex.: Doceria da Ana", max: 120 },
  { key: "contact_name", label: "Responsável", placeholder: "Ex.: Ana Souza", max: 120 },
  { key: "region", label: "Cidade ou região atendida", placeholder: "Ex.: Curitiba e região", max: 120 },
  { key: "instagram", label: "@ do Instagram", placeholder: "@doceriadaana", max: 60 },
  { key: "site", label: "Site", placeholder: "doceriadaana.com.br", max: 200 },
]

const EMPTY_IDENTIFICATION: BriefingIdentification = { brand_name: "", contact_name: "", region: "", instagram: "", site: "" }

/** Lê o jsonb `identification` (campos que faltam viram texto vazio). */
export function parseIdentification(value: unknown): BriefingIdentification {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const result = { ...EMPTY_IDENTIFICATION }
  for (const field of IDENTIFICATION_FIELDS) {
    const raw = source[field.key]
    result[field.key] = typeof raw === "string" ? raw : ""
  }
  return result
}

/** Confere e limpa o que a equipe digitou ao liberar. O nome da marca é obrigatório. */
export function validateIdentification(input: unknown): { ok: true; data: BriefingIdentification } | { ok: false; error: string } {
  const raw = parseIdentification(input)
  const data = { ...EMPTY_IDENTIFICATION }
  for (const field of IDENTIFICATION_FIELDS) {
    const text = raw[field.key].replace(/\s+/g, " ").trim()
    if (text.length > field.max) return { ok: false, error: `${field.label}: até ${field.max} caracteres.` }
    data[field.key] = text
  }
  if (!data.brand_name) return { ok: false, error: "Informe o nome da marca." }
  if (data.instagram && !data.instagram.startsWith("@")) data.instagram = `@${data.instagram}`
  return { ok: true, data }
}

/** Prazo válido: uma data a partir de hoje. */
export function validateDue(due: unknown, today: DateKey): { ok: true; data: DateKey } | { ok: false; error: string } {
  if (!isDateKey(due)) return { ok: false, error: "Escolha a data do prazo." }
  if (due < today) return { ok: false, error: "O prazo não pode ser no passado." }
  return { ok: true, data: due }
}

/** Briefing do cliente como a ficha mostra. */
export interface ClientBriefingSummary {
  id: string
  status: BriefingStatus
  due_on: DateKey
  identification: BriefingIdentification
  released_at: Timestamp
  started_at: Timestamp | null
  submitted_at: Timestamp | null
  last_seen_at: Timestamp | null
  /** Perguntas ativas respondidas (não puladas) e o total. */
  answered: number
  total: number
}

/** Situação do prazo para o selo: no prazo, vence hoje ou atrasado (só enquanto aberto). */
export function dueState(briefing: Pick<ClientBriefingSummary, "status" | "due_on">, today: DateKey): "ok" | "today" | "late" | null {
  if (!isBriefingOpen(briefing.status)) return null
  if (briefing.due_on < today) return "late"
  if (briefing.due_on === today) return "today"
  return "ok"
}
