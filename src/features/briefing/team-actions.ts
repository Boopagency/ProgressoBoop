"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { moveInList, validateBlockInput, validateQuestionInput } from "@/features/briefing/editor-logic"
import {
  buildBriefingView,
  checkStatusChange,
  isTeamStatus,
  nextTeamStatus,
  TEAM_STATUS_COLUMN,
  type TeamStatus,
} from "@/features/briefing/team-logic"
import { getTeamBriefing } from "@/features/briefing/team-queries"
import { ensureMeeting } from "@/features/meetings/mutations"
import { isDateKey } from "@/lib/dates"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, BriefingStatus, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Lado da equipe do briefing (issue #108, Parte 2): os status depois do envio,
 * as notas da imersão e o editor de perguntas. Tudo com a sessão da pessoa e
 * o RLS (a equipe muda o formulário e os briefings; nunca apaga pergunta nem
 * bloco, só desativa).
 */

const BRIEFING_GONE = { ok: false, error: "Esse briefing não existe mais. Atualize a página." } as const
const FORM_GONE = { ok: false, error: "Esse item do formulário não existe mais. Atualize a página." } as const

function refreshClient(clientId: string) {
  revalidatePath(`/clientes/${clientId}`)
  // A central lista todos e abre cada briefing em /briefing/<cliente>.
  revalidatePath("/briefing", "layout")
  revalidatePath("/portal", "layout")
}

function refreshForm() {
  // A configuração e a central (o andamento muda com as perguntas).
  revalidatePath("/briefing", "layout")
  // Briefings em andamento mostram as perguntas novas; a ficha recalcula o que falta.
  revalidatePath("/clientes", "layout")
  revalidatePath("/portal", "layout")
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * Avança (ou volta) um passo depois do envio: Imersão feita → Documento
 * enviado → Validado. A imersão só com todos os obrigatórios respondidos.
 */
export async function setBriefingStatus(clientId: string, from: BriefingStatus, to: BriefingStatus): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return BRIEFING_GONE
  if (!isTeamStatus(to) && to !== "submitted") return { ok: false, error: "Esse status não é marcado pela equipe." }

  const state = await getTeamBriefing(clientId)
  if (!state.available || !state.briefing) return BRIEFING_GONE
  const briefing = state.briefing
  if (briefing.status !== from) return { ok: false, error: "O status do briefing mudou. Atualize a página." }

  const { progress } = buildBriefingView(briefing)
  const check = checkStatusChange(briefing.status, to, progress.missing.length)
  if (!check.ok) return check

  const forward = nextTeamStatus(briefing.status) === to
  const patch: { status: BriefingStatus } & Partial<Record<(typeof TEAM_STATUS_COLUMN)[TeamStatus], string | null>> = {
    status: to,
  }
  if (forward && isTeamStatus(to)) patch[TEAM_STATUS_COLUMN[to]] = new Date().toISOString()
  // Voltar um passo apaga a data do passo desfeito.
  if (!forward && isTeamStatus(briefing.status)) patch[TEAM_STATUS_COLUMN[briefing.status]] = null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_briefings")
    .update(patch)
    .eq("id", briefing.id)
    .eq("status", from)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível mudar o status do briefing.")
  if (data.length === 0) return { ok: false, error: "O status do briefing mudou. Atualize a página." }
  refreshClient(clientId)
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Imersão                                                             */
/* ------------------------------------------------------------------ */

export interface ImmersionInput {
  /** Reunião do calendário (evento e dia); `null` para tirar a ligação. */
  meeting: { eventId: string; date: DateKey } | null
  transcript: string
  notes: string
}

const TRANSCRIPT_MAX = 200_000
const NOTES_MAX = 50_000

export async function saveImmersion(clientId: string, input: ImmersionInput): Promise<ActionResult<{ meetingId: string | null }>> {
  const user = await requireUser()
  if (!isUuid(clientId)) return BRIEFING_GONE
  const transcript = typeof input?.transcript === "string" ? input.transcript.replace(/\r\n/g, "\n").trim() : ""
  const notes = typeof input?.notes === "string" ? input.notes.replace(/\r\n/g, "\n").trim() : ""
  if (transcript.length > TRANSCRIPT_MAX) return { ok: false, error: "A transcrição passa de 200 mil caracteres. Corte o que não é da reunião." }
  if (notes.length > NOTES_MAX) return { ok: false, error: "O resumo passa de 50 mil caracteres." }

  const supabase = await createClient()
  const { data: briefing, error: findError } = await supabase
    .from("client_briefings")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível salvar a imersão.")
  if (!briefing) return BRIEFING_GONE

  let meetingId: string | null = null
  if (input?.meeting) {
    const linked = await linkMeeting(supabase, clientId, input.meeting)
    if (!linked.ok) return linked
    meetingId = linked.data
  }

  const { data: existing, error: existingError } = await supabase
    .from("briefing_immersions")
    .select("id")
    .eq("briefing_id", briefing.id)
    .maybeSingle()
  if (existingError) return dbFailure(existingError, "Não foi possível salvar a imersão.")

  const fields = { meeting_id: meetingId, transcript: transcript || null, notes: notes || null }
  const { error } = existing
    ? await supabase.from("briefing_immersions").update(fields).eq("id", existing.id)
    : await supabase.from("briefing_immersions").insert({ briefing_id: briefing.id, created_by: user.id, ...fields })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Outra pessoa salvou a imersão agora. Atualize a página." }
    return dbFailure(error, "Não foi possível salvar a imersão.")
  }
  refreshClient(clientId)
  return { ok: true, data: { meetingId } }
}

/** A reunião tem de ser deste cliente; cria o registro dela se ainda não houver. */
async function linkMeeting(
  supabase: SupabaseServerClient,
  clientId: string,
  meeting: { eventId: string; date: DateKey }
): Promise<ActionResult<string>> {
  const missing = { ok: false, error: "Essa reunião não existe mais. Escolha outra." } as const
  if (!isUuid(meeting.eventId) || !isDateKey(meeting.date)) return missing
  const { data: event, error } = await supabase.from("events").select("client_id").eq("id", meeting.eventId).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ligar a reunião.")
  if (!event) return missing
  if (event.client_id !== clientId) return { ok: false, error: "Essa reunião é de outro cliente." }
  const ensured = await ensureMeeting(supabase, meeting.eventId, meeting.date)
  if (!ensured.ok) return ensured
  revalidatePath("/reunioes", "layout")
  return { ok: true, data: ensured.data.id }
}

/* ------------------------------------------------------------------ */
/* Editor: blocos                                                      */
/* ------------------------------------------------------------------ */

export async function createBriefingBlock(templateId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(templateId)) return FORM_GONE
  const block = validateBlockInput(input)
  if (!block.ok) return block

  const supabase = await createClient()
  const { data: last, error: lastError } = await supabase
    .from("briefing_blocks")
    .select("position")
    .eq("template_id", templateId)
    .order("position", { ascending: false })
    .limit(1)
  if (lastError) return dbFailure(lastError, "Não foi possível criar o bloco.")
  const { data, error } = await supabase
    .from("briefing_blocks")
    .insert({ template_id: templateId, position: (last[0]?.position ?? 0) + 1, ...block.data })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23503") return FORM_GONE
    return dbFailure(error, "Não foi possível criar o bloco.")
  }
  refreshForm()
  return { ok: true, data: { id: data.id } }
}

export async function updateBriefingBlock(id: string, input: unknown): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return FORM_GONE
  const block = validateBlockInput(input)
  if (!block.ok) return block
  const supabase = await createClient()
  const { data, error } = await supabase.from("briefing_blocks").update(block.data).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível salvar o bloco.")
  if (data.length === 0) return FORM_GONE
  refreshForm()
  return { ok: true, data: null }
}

export async function setBriefingBlockActive(id: string, active: boolean): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return FORM_GONE
  const supabase = await createClient()
  const { data, error } = await supabase.from("briefing_blocks").update({ active: active === true }).eq("id", id).select("id")
  if (error) return dbFailure(error, active ? "Não foi possível reativar o bloco." : "Não foi possível desativar o bloco.")
  if (data.length === 0) return FORM_GONE
  refreshForm()
  return { ok: true, data: null }
}

/** Grava as posições de uma lista já na ordem nova (só as que mudaram). */
async function writePositions(
  supabase: SupabaseServerClient,
  table: "briefing_blocks" | "briefing_questions",
  ordered: readonly { id: string; position: number }[],
  start: number
) {
  for (const [index, item] of ordered.entries()) {
    const position = start + index
    if (item.position === position) continue
    const { error } = await supabase.from(table).update({ position }).eq("id", item.id)
    if (error) return error
  }
  return null
}

export async function moveBriefingBlock(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || (direction !== "up" && direction !== "down")) return FORM_GONE
  const supabase = await createClient()
  const { data: block, error: findError } = await supabase.from("briefing_blocks").select("template_id").eq("id", id).maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível mudar a ordem.")
  if (!block) return FORM_GONE
  const { data: siblings, error } = await supabase
    .from("briefing_blocks")
    .select("id, position")
    .eq("template_id", block.template_id)
    .order("position")
  if (error) return dbFailure(error, "Não foi possível mudar a ordem.")
  // O bloco da posição 0 (identificação) fica sempre no começo; os outros começam em 1.
  const movable = siblings[0]?.position === 0 ? siblings.slice(1) : siblings
  if (!movable.some((item) => item.id === id)) return { ok: false, error: "O bloco de identificação fica sempre no começo." }
  const ordered = moveInList(movable, id, direction)
  if (!ordered) return { ok: true, data: null }
  const writeError = await writePositions(supabase, "briefing_blocks", ordered, 1)
  if (writeError) return dbFailure(writeError, "Não foi possível mudar a ordem.")
  refreshForm()
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Editor: perguntas                                                   */
/* ------------------------------------------------------------------ */

async function blockTemplate(supabase: SupabaseServerClient, blockId: string) {
  return supabase.from("briefing_blocks").select("id, template_id").eq("id", blockId).maybeSingle()
}

async function nextQuestionPosition(supabase: SupabaseServerClient, blockId: string) {
  const { data, error } = await supabase
    .from("briefing_questions")
    .select("position")
    .eq("block_id", blockId)
    .order("position", { ascending: false })
    .limit(1)
  return { position: (data?.[0]?.position ?? 0) + 1, error }
}

export async function createBriefingQuestion(blockId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(blockId)) return FORM_GONE
  const question = validateQuestionInput(input)
  if (!question.ok) return question

  const supabase = await createClient()
  const { data: block, error: blockError } = await blockTemplate(supabase, blockId)
  if (blockError) return dbFailure(blockError, "Não foi possível criar a pergunta.")
  if (!block) return FORM_GONE
  const next = await nextQuestionPosition(supabase, blockId)
  if (next.error) return dbFailure(next.error, "Não foi possível criar a pergunta.")

  const { data, error } = await supabase
    .from("briefing_questions")
    .insert({ block_id: blockId, position: next.position, ...question.data, options: question.data.options as Json })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar a pergunta.")
  refreshForm()
  return { ok: true, data: { id: data.id } }
}

/**
 * Salva a pergunta. As respostas já dadas guardam a cópia de quando foram
 * respondidas: briefing enviado continua com o texto original. Trocar de
 * bloco (do mesmo formulário) leva a pergunta para o fim dele.
 */
export async function updateBriefingQuestion(id: string, input: unknown): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return FORM_GONE
  const supabase = await createClient()
  const { data: current, error: findError } = await supabase
    .from("briefing_questions")
    .select("id, block_id, kind, options, briefing_blocks!inner(template_id)")
    .eq("id", id)
    .maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível salvar a pergunta.")
  if (!current) return FORM_GONE

  const previousOptions =
    current.options && typeof current.options === "object" && !Array.isArray(current.options)
      ? (current.options as Record<string, unknown>)
      : {}
  const question = validateQuestionInput(input, { kind: current.kind, options: previousOptions })
  if (!question.ok) return question

  const patch: Record<string, unknown> = { ...question.data }
  const requestedBlock = (input as { block_id?: unknown })?.block_id
  if (typeof requestedBlock === "string" && requestedBlock !== current.block_id) {
    if (!isUuid(requestedBlock)) return FORM_GONE
    if (current.kind === "identification") return { ok: false, error: "A identificação fica no primeiro bloco." }
    const { data: target, error: targetError } = await blockTemplate(supabase, requestedBlock)
    if (targetError) return dbFailure(targetError, "Não foi possível salvar a pergunta.")
    if (!target || target.template_id !== current.briefing_blocks.template_id) return FORM_GONE
    const next = await nextQuestionPosition(supabase, requestedBlock)
    if (next.error) return dbFailure(next.error, "Não foi possível salvar a pergunta.")
    patch.block_id = requestedBlock
    patch.position = next.position
  }

  const { data, error } = await supabase
    .from("briefing_questions")
    .update(patch as { text: string; options: Json })
    .eq("id", id)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar a pergunta.")
  if (data.length === 0) return FORM_GONE
  refreshForm()
  return { ok: true, data: null }
}

export async function setBriefingQuestionActive(id: string, active: boolean): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return FORM_GONE
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("briefing_questions")
    .update({ active: active === true })
    .eq("id", id)
    .neq("kind", "identification")
    .select("id")
  if (error) return dbFailure(error, active ? "Não foi possível reativar a pergunta." : "Não foi possível desativar a pergunta.")
  if (data.length === 0) return { ok: false, error: "A identificação não pode ser desativada." }
  refreshForm()
  return { ok: true, data: null }
}

export async function moveBriefingQuestion(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id) || (direction !== "up" && direction !== "down")) return FORM_GONE
  const supabase = await createClient()
  const { data: question, error: findError } = await supabase.from("briefing_questions").select("block_id").eq("id", id).maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível mudar a ordem.")
  if (!question) return FORM_GONE
  const { data: siblings, error } = await supabase
    .from("briefing_questions")
    .select("id, position")
    .eq("block_id", question.block_id)
    .order("position")
  if (error) return dbFailure(error, "Não foi possível mudar a ordem.")
  const ordered = moveInList(siblings, id, direction)
  if (!ordered) return { ok: true, data: null }
  const writeError = await writePositions(supabase, "briefing_questions", ordered, 1)
  if (writeError) return dbFailure(writeError, "Não foi possível mudar a ordem.")
  refreshForm()
  return { ok: true, data: null }
}
