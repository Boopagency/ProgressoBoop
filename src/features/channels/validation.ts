import { BODY_MAX, CHANNEL_NAME_MAX } from "@/features/channels/logic"
import type { MessageKind } from "@/lib/types"
import { isUuid } from "@/lib/utils"

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** Tipos que a equipe escreve (`system` é do banco). */
export type WritableKind = Exclude<MessageKind, "system">

export function isWritableKind(value: unknown): value is WritableKind {
  return value === "text" || value === "change_request" || value === "approval"
}

export function parseBody(raw: unknown): Parsed<string> {
  const body = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : ""
  if (!body) return { ok: false, error: "Escreva a mensagem." }
  if (body.length > BODY_MAX) return { ok: false, error: "Mensagem muito longa (até 5.000 letras)." }
  return { ok: true, value: body }
}

/** Nome de canal interno: sem "#" na frente, espaços simples. */
export function parseChannelName(raw: unknown): Parsed<string> {
  const name = typeof raw === "string" ? raw.replace(/^#+/, "").replace(/\s+/g, " ").trim() : ""
  if (!name) return { ok: false, error: "Dê um nome ao canal." }
  if (name.length > CHANNEL_NAME_MAX) return { ok: false, error: "Nome muito longo." }
  return { ok: true, value: name }
}

export function parseMemberIds(raw: unknown): Parsed<string[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Participantes inválidos." }
  const ids = [...new Set(raw)]
  if (!ids.every(isUuid)) return { ok: false, error: "Participantes inválidos." }
  return { ok: true, value: ids }
}

export interface NewMessageInput {
  channel_id: string
  body: string
  kind: WritableKind
  post_id: string | null
  project_id?: string | null
}

export function parseNewMessage(raw: unknown): Parsed<NewMessageInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Dados inválidos." }
  const input = raw as Record<string, unknown>
  if (!isUuid(input.channel_id)) return { ok: false, error: "Esse canal não existe mais." }
  if (!isWritableKind(input.kind)) return { ok: false, error: "Tipo de mensagem inválido." }
  if (input.post_id !== null && input.post_id !== undefined && !isUuid(input.post_id)) return { ok: false, error: "Post inválido." }
  if (input.project_id !== null && input.project_id !== undefined && !isUuid(input.project_id)) {
    return { ok: false, error: "Projeto inválido." }
  }
  const body = parseBody(input.body)
  if (!body.ok) return body
  return {
    ok: true,
    value: {
      channel_id: input.channel_id,
      body: body.value,
      kind: input.kind,
      post_id: (input.post_id as string | null) ?? null,
      project_id: (input.project_id as string | null) ?? null,
    },
  }
}
