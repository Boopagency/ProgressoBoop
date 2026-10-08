import type { ContentIdea } from "@/lib/types"

/*
 * Banco de ideias: funções puras sobre as ideias e referências de cada
 * cliente, sem React.
 *
 * - "No cronograma" é a ideia que já virou post (`post_id` preenchido). Se o
 *   post for excluído, o banco limpa o vínculo e a ideia volta a ficar livre.
 * - Virar post: o post nasce com o título e o formato da ideia; as notas e o
 *   link de referência vão para o conteúdo/ideia (brief) do post.
 * - Ordem: a ideia mais nova primeiro.
 */

/** A ideia já virou post. */
export function isScheduled(idea: Pick<ContentIdea, "post_id">): boolean {
  return idea.post_id !== null
}

/** Ideias dos clientes escolhidos (nenhum escolhido: todas). */
export function filterIdeas<T extends Pick<ContentIdea, "client_id">>(ideas: readonly T[], clientIds: readonly string[]): T[] {
  return clientIds.length === 0 ? [...ideas] : ideas.filter((idea) => clientIds.includes(idea.client_id))
}

type Sortable = Pick<ContentIdea, "post_id" | "created_at">

/** Ideias livres e as que já estão no cronograma, cada lista com a mais nova primeiro. */
export function splitIdeas<T extends Sortable>(ideas: readonly T[]): { open: T[]; scheduled: T[] } {
  const sorted = [...ideas].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    open: sorted.filter((idea) => !isScheduled(idea)),
    scheduled: sorted.filter(isScheduled),
  }
}

/**
 * Conteúdo/ideia (brief) do post que nasce da ideia: as notas e, no fim, o
 * link de referência, dentro do limite do campo (as notas são cortadas, o
 * link fica inteiro). Sem nenhum dos dois, null.
 */
export function ideaBrief(idea: Pick<ContentIdea, "notes" | "reference_url">, max = 5000): string | null {
  const notes = idea.notes?.trim() || null
  const reference = idea.reference_url ? `Referência: ${idea.reference_url}` : null
  if (!reference) return notes ? notes.slice(0, max) : null
  if (!notes) return reference.slice(0, max)
  const room = max - reference.length - 2
  if (room <= 1) return reference.slice(0, max)
  const body = notes.length > room ? `${notes.slice(0, room - 1).trimEnd()}…` : notes
  return `${body}\n\n${reference}`
}

/** Endereço que abre a ideia na visão Ideias do Conteúdo, já filtrada pelo cliente. */
export function ideaHref(idea: Pick<ContentIdea, "id" | "client_id">): string {
  return `/conteudo?cliente=${idea.client_id}&ver=ideias&ideia=${idea.id}`
}
