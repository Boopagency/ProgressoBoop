import type { Timestamp } from "@/lib/types"

/*
 * Indicações do cliente pelo portal: quem o cliente indicou vira um negócio
 * no Comercial (Lead, origem Indicação) e avisa quem cuida das indicações.
 * Funções puras; os limites são os mesmos que o banco confere
 * (portal_refer_lead).
 */

export const REFERRAL_NAME_MAX = 120
export const REFERRAL_COMPANY_MAX = 200
export const REFERRAL_PHONE_MAX = 40
export const REFERRAL_EMAIL_MAX = 200
export const REFERRAL_NOTE_MAX = 2000

export interface ReferralInput {
  name: string
  company: string
  phone: string
  email: string
  note: string
}

export const EMPTY_REFERRAL: ReferralInput = { name: "", company: "", phone: "", email: "", note: "" }

/** Em que pé está a indicação, como o cliente vê (sem valores nem notas). */
export type ReferralStatus = "received" | "talking" | "won" | "closed"

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  received: "Recebida",
  talking: "Em conversa",
  won: "Virou cliente",
  closed: "Encerrada",
}

export interface PortalReferral {
  id: string
  contact_name: string
  company: string | null
  status: ReferralStatus
  created_at: Timestamp
}

export function isReferralStatus(value: unknown): value is ReferralStatus {
  return typeof value === "string" && Object.hasOwn(REFERRAL_STATUS_LABEL, value)
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Confere e limpa o formulário. Devolve o erro para mostrar, ou os campos prontos. */
export function validateReferral(raw: Partial<ReferralInput>): { ok: true; data: ReferralInput } | { ok: false; error: string } {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
  const data: ReferralInput = {
    name: text(raw.name).replace(/\s+/g, " "),
    company: text(raw.company).replace(/\s+/g, " "),
    phone: text(raw.phone),
    email: text(raw.email).toLowerCase(),
    note: text(raw.note),
  }
  if (!data.name) return { ok: false, error: "Diga o nome de quem você está indicando." }
  if (data.name.length > REFERRAL_NAME_MAX) return { ok: false, error: `O nome pode ter até ${REFERRAL_NAME_MAX} letras.` }
  if (data.company.length > REFERRAL_COMPANY_MAX) {
    return { ok: false, error: `A empresa pode ter até ${REFERRAL_COMPANY_MAX} letras.` }
  }
  if (!data.phone && !data.email) return { ok: false, error: "Deixe um WhatsApp ou um e-mail para a gente falar com a pessoa." }
  if (data.phone.length > REFERRAL_PHONE_MAX || (data.phone && !/\d{8,}/.test(data.phone.replace(/\D/g, "")))) {
    return { ok: false, error: "Confira o WhatsApp (com DDD)." }
  }
  if (data.email && (data.email.length > REFERRAL_EMAIL_MAX || !EMAIL.test(data.email))) {
    return { ok: false, error: "Confira o e-mail." }
  }
  if (data.note.length > REFERRAL_NOTE_MAX) {
    return { ok: false, error: `Escreva até ${REFERRAL_NOTE_MAX.toLocaleString("pt-BR")} caracteres.` }
  }
  return { ok: true, data }
}
