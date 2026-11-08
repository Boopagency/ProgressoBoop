"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  BRIEFING_FILE_MAX_BYTES,
  isBriefingFileType,
  normalizeValue,
  parseAnswerValue,
  parseFiles,
  type AnswerValue,
  type BriefingFile,
} from "@/features/briefing/flow-logic"
import { defaultBriefingDue, validateDue, validateIdentification, type BriefingIdentification } from "@/features/briefing/logic"
import { BRIEFING_BUCKET, clientBriefingPaths, removeBriefingObjects } from "@/features/briefing/storage"
import { todayKey } from "@/lib/dates"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Lado da equipe do briefing de onboarding: preparar (criar sem liberar, para
 * preencher o que a Boop já sabe), liberar (com os dados do bloco 0
 * conferidos e o prazo, que conta a partir daí), mudar o prazo, cancelar e
 * responder pelo cliente. Liberado e não enviado, o portal desse cliente só
 * mostra o Briefing; preparando, o cliente não vê nada.
 */

const CLIENT_GONE = { ok: false, error: "Esse cliente não existe mais." } as const
const BRIEFING_GONE = { ok: false, error: "Esse briefing não existe mais. Atualize a página." } as const

function refresh(clientId: string) {
  revalidatePath(`/clientes/${clientId}`)
  // A central lista todos e abre cada briefing em /briefing/<cliente>.
  revalidatePath("/briefing", "layout")
  revalidatePath("/portal", "layout")
}

async function activeTemplate(supabase: SupabaseServerClient): Promise<ActionResult<string>> {
  const { data, error } = await supabase.from("briefing_templates").select("id").eq("active", true).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir o formulário do briefing.")
  if (!data) return { ok: false, error: "Nenhum formulário de briefing está ativo." }
  return { ok: true, data: data.id }
}

/**
 * Cria o briefing em preparação: a equipe preenche o que já sabe, o cliente
 * não vê e o portal não trava. O prazo de verdade é escolhido ao liberar.
 */
export async function prepareBriefing(clientId: string, input: { identification: BriefingIdentification }): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE
  const identification = validateIdentification(input?.identification)
  if (!identification.ok) return identification

  const supabase = await createClient()
  const template = await activeTemplate(supabase)
  if (!template.ok) return template
  const { error } = await supabase.from("client_briefings").insert({
    client_id: clientId,
    template_id: template.data,
    status: "preparing",
    due_on: defaultBriefingDue(todayKey()),
    identification: { ...identification.data },
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Este cliente já tem um briefing. Atualize a página." }
    if (error.code === "23503") return CLIENT_GONE
    return dbFailure(error, "Não foi possível preparar o briefing.")
  }
  refresh(clientId)
  return { ok: true, data: null }
}

/**
 * Libera o briefing para o cliente: o novo ou o que estava em preparação (com
 * as respostas que a Boop já preencheu). O prazo conta a partir de agora e o
 * portal do cliente passa a mostrar só o Briefing.
 */
export async function releaseBriefing(
  clientId: string,
  input: { identification: BriefingIdentification; due_on: DateKey }
): Promise<ActionResult> {
  const user = await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE
  const identification = validateIdentification(input?.identification)
  if (!identification.ok) return identification
  const due = validateDue(input?.due_on, todayKey())
  if (!due.ok) return due

  const supabase = await createClient()
  const { data: existing, error: findError } = await supabase
    .from("client_briefings")
    .select("id, status")
    .eq("client_id", clientId)
    .maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível liberar o briefing.")

  if (existing) {
    if (existing.status !== "preparing") return { ok: false, error: "Este cliente já tem um briefing liberado." }
    const { data, error } = await supabase
      .from("client_briefings")
      .update({
        status: "not_started",
        due_on: due.data,
        identification: { ...identification.data },
        released_at: new Date().toISOString(),
        released_by: user.id,
      })
      .eq("id", existing.id)
      .eq("status", "preparing")
      .select("id")
    if (error) return dbFailure(error, "Não foi possível liberar o briefing.")
    if (data.length === 0) return { ok: false, error: "O briefing mudou. Atualize a página." }
    refresh(clientId)
    return { ok: true, data: null }
  }

  const template = await activeTemplate(supabase)
  if (!template.ok) return template
  const { error } = await supabase.from("client_briefings").insert({
    client_id: clientId,
    template_id: template.data,
    due_on: due.data,
    identification: { ...identification.data },
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Este cliente já tem um briefing liberado." }
    if (error.code === "23503") return CLIENT_GONE
    return dbFailure(error, "Não foi possível liberar o briefing.")
  }
  refresh(clientId)
  return { ok: true, data: null }
}

export async function changeBriefingDue(clientId: string, dueOn: DateKey): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE
  const due = validateDue(dueOn, todayKey())
  if (!due.ok) return due

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_briefings")
    .update({ due_on: due.data })
    .eq("client_id", clientId)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível mudar o prazo.")
  if (data.length === 0) return BRIEFING_GONE
  refresh(clientId)
  return { ok: true, data: null }
}

/**
 * Desfaz a liberação enquanto o cliente não respondeu nada (o portal volta ao
 * normal), ou descarta o briefing em preparação com o que a equipe preencheu
 * (as respostas saem em cascata e os arquivos, depois).
 */
export async function cancelBriefing(clientId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_GONE

  const supabase = await createClient()
  const { data: briefing, error: findError } = await supabase
    .from("client_briefings")
    .select("id, status")
    .eq("client_id", clientId)
    .maybeSingle()
  if (findError) return dbFailure(findError, "Não foi possível cancelar o briefing.")
  if (!briefing) return BRIEFING_GONE
  const preparing = briefing.status === "preparing"
  if (!preparing) {
    const { count, error: countError } = await supabase
      .from("briefing_answers")
      .select("id", { count: "exact", head: true })
      .eq("briefing_id", briefing.id)
      // Só as que o cliente gravou: o que a Boop preencheu não conta.
      .not("answered_by", "is", null)
    if (countError) return dbFailure(countError, "Não foi possível cancelar o briefing.")
    if (briefing.status !== "not_started" || (count ?? 0) > 0) {
      return { ok: false, error: "O cliente já começou a responder. Não dá mais para cancelar a liberação." }
    }
  }

  const paths = await clientBriefingPaths(supabase, clientId)
  const { data, error } = await supabase
    .from("client_briefings")
    .delete()
    .eq("id", briefing.id)
    .eq("status", briefing.status)
    .select("id")
  if (error) return dbFailure(error, "Não foi possível cancelar o briefing.")
  if (data.length === 0) return BRIEFING_GONE
  await removeBriefingObjects(supabase, paths)
  refresh(clientId)
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* A equipe responde pelo cliente                                      */
/* ------------------------------------------------------------------ */

const ANSWER_FAILED = "Não foi possível salvar a resposta. Tente de novo."

const ANSWER_ERRORS: Partial<Record<string, string>> = {
  question_not_found: "Esta pergunta saiu do briefing. Atualize a página.",
  invalid_file: "Um dos arquivos não é deste briefing. Envie de novo.",
}

async function findBriefing(supabase: SupabaseServerClient, clientId: string): Promise<{ id: string; client_id: string } | null> {
  if (!isUuid(clientId)) return null
  const { data } = await supabase.from("client_briefings").select("id, client_id").eq("client_id", clientId).maybeSingle()
  return data ?? null
}

export interface TeamAnswerInput {
  text: string
  value: AnswerValue
  files: BriefingFile[]
}

/**
 * Grava a resposta de uma pergunta pela equipe, em qualquer momento (preparando,
 * liberado ou depois do envio). O banco marca "preenchida pela Boop" e guarda a
 * cópia da pergunta; o cliente vê a resposta e pode confirmar ou mudar.
 */
export async function saveTeamBriefingAnswer(clientId: string, questionId: string, input: TeamAnswerInput): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(questionId)) return BRIEFING_GONE
  const text = String(input?.text ?? "").trim()
  if (text.length > 10000) return { ok: false, error: "A resposta escrita pode ter até 10.000 caracteres." }
  const value = normalizeValue(parseAnswerValue(input?.value))
  if (value && JSON.stringify(value).length > 20000) return { ok: false, error: "A resposta ficou grande demais." }
  const files = parseFiles(input?.files).slice(0, 30)

  const supabase = await createClient()
  const briefing = await findBriefing(supabase, clientId)
  if (!briefing) return BRIEFING_GONE
  const { error } = await supabase.from("briefing_answers").upsert(
    {
      briefing_id: briefing.id,
      question_id: questionId,
      text: text || null,
      value: value ? (JSON.parse(JSON.stringify(value)) as Json) : null,
      files: files.map((file) => ({ ...file })),
      skipped: false,
    },
    { onConflict: "briefing_id,question_id" }
  )
  if (error) {
    const known = ANSWER_ERRORS[error.message]
    return known ? { ok: false, error: known } : dbFailure(error, ANSWER_FAILED)
  }
  refresh(clientId)
  return { ok: true, data: null }
}

/** URL assinada para a equipe enviar um arquivo direto ao Storage, na pasta do briefing. */
export async function createTeamBriefingUpload(
  clientId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  await requireUser()
  const type = String(contentType ?? "")
  if (!isBriefingFileType(type)) return { ok: false, error: "Esse tipo de arquivo não é aceito. Use imagem, PDF, vídeo, fonte ou zip." }
  if (!Number.isFinite(size) || size <= 0 || size > BRIEFING_FILE_MAX_BYTES) return { ok: false, error: "O arquivo precisa ter até 50 MB." }

  const supabase = await createClient()
  const briefing = await findBriefing(supabase, clientId)
  if (!briefing) return BRIEFING_GONE
  const path = `${briefing.client_id}/${briefing.id}/files/${crypto.randomUUID()}`
  const { data, error } = await supabase.storage.from(BRIEFING_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar. Confira a conexão e tente de novo." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/** Tira do Storage um arquivo que a equipe enviou e não ficou em nenhuma resposta. */
export async function discardTeamBriefingUpload(clientId: string, path: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()
  const briefing = await findBriefing(supabase, clientId)
  if (!briefing || typeof path !== "string" || !path.startsWith(`${briefing.client_id}/${briefing.id}/`)) return BRIEFING_GONE
  const { data } = await supabase
    .from("briefing_answers")
    .select("id")
    .eq("briefing_id", briefing.id)
    .contains("files", JSON.stringify([{ path }]))
    .limit(1)
  if ((data?.length ?? 0) > 0) return { ok: true, data: null }
  await removeBriefingObjects(supabase, [path])
  return { ok: true, data: null }
}
