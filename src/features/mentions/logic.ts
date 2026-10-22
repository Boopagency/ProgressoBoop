/*
 * Menções nas conversas: no campo de escrever, "@" ou "/" abre a busca e o
 * item escolhido (um post, uma reunião, uma tarefa…) entra no texto como
 * `@[Título](post:<id>)`. A mensagem continua sendo texto puro no banco (sem
 * tabela nova): quem mostra a mensagem troca a marca por um link clicável,
 * e os avisos (sino, push, prévias) mostram só "@Título".
 */

export const MENTION_KINDS = [
  "post",
  "meeting",
  "event",
  "task",
  "project",
  "idea",
  "finance",
  "deal",
  "doc",
  "client",
] as const

export type MentionKind = (typeof MENTION_KINDS)[number]

export interface Mention {
  kind: MentionKind
  /** Uuid; na reunião ainda sem registro, `<evento>.<dia>`; no financeiro, o mês (`2026-10`) ou `atual`. */
  id: string
  label: string
}

/** Um resultado da busca de menções. */
export interface MentionOption extends Mention {
  detail: string | null
  group: string
}

export const LABEL_MAX = 80

const KIND_PATTERN = MENTION_KINDS.join("|")
const TOKEN_PATTERN = `@\\[([^\\[\\]\\n]{1,${LABEL_MAX}})\\]\\((${KIND_PATTERN}):([A-Za-z0-9.-]{1,80})\\)`

/** O texto em pedaços: texto solto e menções, na ordem. */
export type MentionPart = { type: "text"; text: string } | { type: "mention"; mention: Mention }

export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = []
  const pattern = new RegExp(TOKEN_PATTERN, "g")
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    if (start > last) parts.push({ type: "text", text: text.slice(last, start) })
    parts.push({ type: "mention", mention: { label: match[1]!, kind: match[2] as MentionKind, id: match[3]! } })
    last = start + match[0].length
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) })
  return parts
}

export function hasMentions(text: string): boolean {
  return new RegExp(TOKEN_PATTERN).test(text)
}

/**
 * O texto com as menções como "@Título" (prévias, sino, push, título de
 * tarefa). O aviso do banco corta a mensagem: uma marca cortada no fim
 * também vira "@Título".
 */
export function mentionPlainText(text: string): string {
  return text
    .replace(new RegExp(TOKEN_PATTERN, "g"), (_match, label: string) => `@${label}`)
    .replace(/@\[([^[\]\n]{1,80})\](\([^)\s]*)?$/, (_match, label: string) => `@${label}`)
}

/** Título que cabe na marca: uma linha, sem colchetes, até o limite. */
export function mentionLabel(text: string): string {
  const clean = text.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim()
  if (clean.length <= LABEL_MAX) return clean || "Sem título"
  return `${clean.slice(0, LABEL_MAX - 1).trimEnd()}…`
}

export function mentionToken(mention: Mention): string {
  return `@[${mentionLabel(mention.label)}](${mention.kind}:${mention.id})`
}

/**
 * Troca o "@Título" que o campo mostra pela marca, só para as menções que a
 * pessoa escolheu na busca (e que continuam no texto, do jeito que entraram).
 */
export function applyMentions(text: string, picked: readonly Mention[]): string {
  let result = text
  for (const mention of picked) {
    const visible = `@${mentionLabel(mention.label)}`
    const index = result.indexOf(visible)
    if (index === -1) continue
    // A marca começa com "@[", então uma já trocada não é encontrada de novo.
    const token = mentionToken(mention)
    result = result.slice(0, index) + token + result.slice(index + visible.length)
  }
  return result
}

/** O texto visível no campo ao editar uma mensagem com menções, e as menções que ele tem. */
export function mentionsForEditing(text: string): { text: string; picked: Mention[] } {
  const picked: Mention[] = []
  const visible = splitMentions(text)
    .map((part) => {
      if (part.type === "text") return part.text
      picked.push(part.mention)
      return `@${part.mention.label}`
    })
    .join("")
  return { text: visible, picked }
}

/**
 * A busca aberta pelo que está antes do cursor: "@" ou "/" no começo ou
 * depois de um espaço, e até 40 letras na mesma linha. `start` é a posição
 * do "@" (ou da "/").
 */
export function activeMentionQuery(textBeforeCaret: string): { start: number; query: string } | null {
  const match = /(^|\s)([@/])([^\n@/[\]]{0,40})$/.exec(textBeforeCaret)
  if (!match) return null
  const query = match[3]!
  // Dois espaços seguidos: a pessoa desistiu de mencionar e voltou a escrever.
  if (/\s\s/.test(query) || /^\s/.test(query)) return null
  return { start: match.index + match[1]!.length, query }
}

/** Endereço do item no Boop Admin (equipe). Reunião sem registro não tem: abre pelo evento. */
export function mentionHref(mention: Mention): string | null {
  switch (mention.kind) {
    case "post":
      return `/conteudo?post=${mention.id}`
    case "meeting":
      return `/reunioes/${mention.id}`
    case "task":
      return `/tarefas?tarefa=${mention.id}`
    case "project":
      return `/projetos/${mention.id}`
    case "idea": {
      const [clientId, ideaId] = mention.id.split(".")
      return clientId && ideaId ? `/conteudo?cliente=${clientId}&ver=ideias&ideia=${ideaId}` : null
    }
    case "finance":
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(mention.id) ? `/financeiro?mes=${mention.id}` : "/financeiro"
    case "deal":
      return `/comercial?negocio=${mention.id}`
    case "doc":
      return `/processos/${mention.id}`
    case "client":
      return `/clientes/${mention.id}`
    case "event":
      return null
  }
}

/** Reunião ainda sem registro: o evento e o dia. */
export function mentionEvent(mention: Mention): { eventId: string; date: string } | null {
  if (mention.kind !== "event") return null
  const [eventId, date] = mention.id.split(".")
  return eventId && date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { eventId, date } : null
}

/** No portal, só posts e projetos (o que o cliente vê) viram link. */
export function portalMentionPath(mention: Mention): string | null {
  if (mention.kind === "post") return `/portal/posts/${mention.id}`
  if (mention.kind === "project") return `/portal/projetos/${mention.id}`
  return null
}
