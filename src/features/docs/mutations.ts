import "server-only"

import { blocksToText } from "@/features/docs/logic"
import { SUGGESTIONS, templateById, type TemplateId } from "@/features/docs/templates"
import { parseContent, parseDocPatch, TEXT_MAX, TITLE_MAX } from "@/features/docs/validation"
import { todayKey } from "@/lib/dates"
import { isTaskArea } from "@/lib/labels"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DocKind, TaskArea } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações dos processos, usadas pelas Server Actions e pelo conector do
 * Claude (mesma validação, mesmo RLS). O banco cuida do resto: autoria, data
 * de atualização e versões anteriores (trigger set_doc_fields).
 */

export const NOT_FOUND = { ok: false, error: "Esse processo não existe mais." } as const

/** Revisão padrão: guias a cada 12 meses; o resto a cada 6. */
function defaultReview(kind: DocKind): number {
  return kind === "guide" ? 12 : 6
}

export interface NewDocInput {
  title: string
  /** Modelo, ou o índice de uma sugestão da lista "Para começar". */
  template?: TemplateId
  suggestion?: number
  area?: TaskArea | null
  client_id?: string | null
}

export async function insertDoc(supabase: SupabaseServerClient, userId: string, input: NewDocInput): Promise<ActionResult<{ id: string }>> {
  const suggestion =
    typeof input?.suggestion === "number" ? SUGGESTIONS[input.suggestion] : undefined
  const template = suggestion ? undefined : (templateById(input?.template) ?? templateById("blank"))
  const kind = suggestion?.kind ?? template?.kind ?? "process"

  const title = (suggestion?.title ?? (typeof input?.title === "string" ? input.title : ""))
    .replace(/\s+/g, " ")
    .trim()
  if (!title) return { ok: false, error: "Dê um título ao documento." }
  if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }

  // Modelos do cliente pedem o cliente e, sem área escolhida, ficam em Clientes.
  const area = suggestion?.area ?? (isTaskArea(input?.area) ? input.area : template?.client ? "clients" : null)
  const clientId = input?.client_id == null ? null : isUuid(input.client_id) ? input.client_id : undefined
  if (clientId === undefined) return { ok: false, error: "Cliente inválido." }
  if (template?.client && !clientId) return { ok: false, error: "Escolha o cliente deste documento." }

  const blocks = (suggestion ?? template)?.blocks() ?? []
  const { data, error } = await supabase
    .from("docs")
    .insert({
      title,
      kind,
      area,
      client_id: clientId,
      owner_id: userId,
      summary: suggestion?.summary ?? template?.summary ?? null,
      pinned: suggestion?.pinned ?? false,
      content: blocks as unknown as Json,
      content_text: blocksToText(blocks).slice(0, TEXT_MAX),
      review_every_months: template?.reviewEveryMonths !== undefined ? template.reviewEveryMonths : defaultReview(kind),
      reviewed_on: todayKey(),
    })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar o documento.")

  return { ok: true, data: { id: data.id } }
}

export async function patchDoc(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseDocPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }

  const { data, error } = await supabase.from("docs").update(parsed.value).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return NOT_FOUND

  return { ok: true, data: null }
}

export type SaveContentResult =
  | { ok: true; data: { stamp: string } }
  | { ok: false; error: string; conflict?: { by: string | null; at: string } }

/**
 * Salva o conteúdo do editor. `baseStamp` é o carimbo (`content_updated_at`)
 * do conteúdo que a pessoa estava editando: se alguém salvou outro conteúdo
 * depois disso, devolve `conflict` em vez de sobrescrever (a não ser com
 * `force`; o texto da outra pessoa fica no histórico).
 */
export async function writeDocContent(
  supabase: SupabaseServerClient,
  id: string,
  content: unknown,
  baseStamp: string,
  force = false
): Promise<SaveContentResult> {
  if (!isUuid(id) || typeof baseStamp !== "string") return NOT_FOUND
  const parsed = parseContent(content)
  if (!parsed.ok) return parsed

  let query = supabase
    .from("docs")
    .update({
      content: parsed.value as unknown as Json,
      content_text: blocksToText(parsed.value).slice(0, TEXT_MAX),
    })
    .eq("id", id)
  if (!force) query = query.eq("content_updated_at", baseStamp)
  const { data, error } = await query.select("content_updated_at")
  if (error) return dbFailure(error, "Não foi possível salvar o documento.")

  if (data.length === 0) {
    const { data: current } = await supabase
      .from("docs")
      .select("content_updated_at, content_updated_by")
      .eq("id", id)
      .maybeSingle()
    if (!current) return NOT_FOUND
    return {
      ok: false,
      error: "O documento mudou enquanto você editava.",
      conflict: { by: current.content_updated_by, at: current.content_updated_at },
    }
  }
  return { ok: true, data: { stamp: data[0]!.content_updated_at } }
}

/** Revisado hoje: a próxima revisão conta a partir de agora. */
export async function writeDocReviewed(supabase: SupabaseServerClient, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND

  const { data, error } = await supabase
    .from("docs")
    .update({ reviewed_on: todayKey(), status: "active" })
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível marcar como revisado.")
  if (data.length === 0) return NOT_FOUND

  return { ok: true, data: null }
}
