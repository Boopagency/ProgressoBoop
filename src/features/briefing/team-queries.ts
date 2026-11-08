import "server-only"

import { requireUser } from "@/features/auth/session"
import { parseAnalysisContent, type TeamBriefingAnalysis } from "@/features/briefing/analysis-logic"
import { analysisSourceHash, buildAnalysisSource } from "@/features/briefing/analysis-source"
import { buildBriefingCentral, type BriefingCentral, type CentralClient } from "@/features/briefing/central-logic"
import { isBriefingOpen, isBriefingPreparing, parseIdentification } from "@/features/briefing/logic"
import {
  parseFiles,
  parseQuestionOptions,
  parseSnapshot,
  type TeamBriefingBlock,
  type TeamBriefingDetail,
  type TeamBriefingQuestion,
} from "@/features/briefing/team-logic"
import { isMissingRelation } from "@/features/client-files/queries"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { DateKey } from "@/lib/types"

/*
 * Leituras da equipe: a aba Briefing da ficha do cliente e o editor de
 * perguntas. Tudo com a sessão da pessoa (o RLS deixa a equipe ler tudo do
 * briefing, inclusive transcrições e resumos, que o cliente não lê).
 */

const BLOCK_COLUMNS = "id, template_id, position, title, description, estimated_minutes, active"
const QUESTION_COLUMNS = "id, block_id, position, key, text, hint, kind, options, required, active, created_at"

function toBlock(row: {
  id: string
  position: number
  title: string
  description: string | null
  estimated_minutes: number | null
  active: boolean
}): TeamBriefingBlock {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    description: row.description,
    estimated_minutes: row.estimated_minutes,
    active: row.active,
  }
}

function toQuestion(row: {
  id: string
  block_id: string
  position: number
  key: string | null
  text: string
  hint: string | null
  kind: TeamBriefingQuestion["kind"]
  options: unknown
  required: boolean
  active: boolean
  created_at: string
}): TeamBriefingQuestion {
  return { ...row, options: parseQuestionOptions(row.options) }
}

/** Blocos e perguntas dos formulários indicados (a central lê todos os que os briefings usam de uma vez). */
async function loadForms(supabase: SupabaseServerClient, templateIds: string[]) {
  if (templateIds.length === 0) return { blocks: [], questions: [] }
  const blocks = await supabase.from("briefing_blocks").select(BLOCK_COLUMNS).in("template_id", templateIds).order("position")
  if (blocks.error) throw loadError(blocks.error, "o formulário do briefing")
  const blockIds = blocks.data.map((block) => block.id)
  const questions =
    blockIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("briefing_questions").select(QUESTION_COLUMNS).in("block_id", blockIds).order("position")
  if (questions.error) throw loadError(questions.error, "o formulário do briefing")
  return {
    blocks: blocks.data.map((row) => ({ ...toBlock(row), template_id: row.template_id })),
    questions: questions.data.map(toQuestion),
  }
}

function loadForm(supabase: SupabaseServerClient, templateId: string) {
  return loadForms(supabase, [templateId])
}

/** A aba Briefing: `available: false` antes da migration; `briefing: null` antes de liberar. */
export type TeamBriefingState = { available: false } | { available: true; briefing: TeamBriefingDetail | null }

export async function getTeamBriefing(clientId: string): Promise<TeamBriefingState> {
  await requireUser()
  const supabase = await createClient()
  const { data: briefing, error } = await supabase
    .from("client_briefings")
    .select(
      "id, template_id, status, due_on, identification, released_at, started_at, submitted_at, immersion_at, document_sent_at, validated_at, last_seen_at"
    )
    .eq("client_id", clientId)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return { available: false }
    throw loadError(error, "o briefing do cliente")
  }
  if (!briefing) return { available: true, briefing: null }

  const [form, answers, audios, immersion, analysis] = await Promise.all([
    loadForm(supabase, briefing.template_id),
    supabase
      .from("briefing_answers")
      .select("id, question_id, question_snapshot, text, value, files, skipped, updated_at, filled_by_team, team_filled_at, answered_by")
      .eq("briefing_id", briefing.id),
    supabase
      .from("briefing_answer_audios")
      .select("id, answer_id, storage_path, duration_ms, created_at")
      .eq("briefing_id", briefing.id)
      .order("created_at"),
    supabase.from("briefing_immersions").select("meeting_id, transcript, notes, updated_at").eq("briefing_id", briefing.id).maybeSingle(),
    supabase
      .from("briefing_analyses")
      .select("status, attempts, content, error, origin, source_hash, requested_at, finished_at")
      .eq("briefing_id", briefing.id)
      .maybeSingle(),
  ])
  if (answers.error) throw loadError(answers.error, "as respostas do briefing")
  if (audios.error) throw loadError(audios.error, "os áudios do briefing")
  if (immersion.error) throw loadError(immersion.error, "as notas da imersão")
  // Antes da migration da análise, a aba segue sem ela.
  if (analysis.error && !isMissingRelation(analysis.error)) throw loadError(analysis.error, "a análise do briefing")

  const answerIds = answers.data.map((answer) => answer.id)
  const audioIds = audios.data.map((audio) => audio.id)
  const [transcriptions, summaries] = await Promise.all([
    audioIds.length === 0
      ? { data: [], error: null }
      : supabase.from("briefing_transcriptions").select("audio_id, status, transcript, error").in("audio_id", audioIds),
    answerIds.length === 0
      ? { data: [], error: null }
      : supabase.from("briefing_summaries").select("answer_id, status, summary, error").in("answer_id", answerIds),
  ])
  if (transcriptions.error) throw loadError(transcriptions.error, "as transcrições do briefing")
  if (summaries.error) throw loadError(summaries.error, "os resumos do briefing")

  const transcriptionByAudio = new Map(transcriptions.data.map((row) => [row.audio_id, row]))
  const summaryByAnswer = new Map(summaries.data.map((row) => [row.answer_id, row]))

  const detail: TeamBriefingDetail = {
      id: briefing.id,
      status: briefing.status,
      due_on: briefing.due_on,
      identification: parseIdentification(briefing.identification),
      released_at: briefing.released_at,
      started_at: briefing.started_at,
      submitted_at: briefing.submitted_at,
      immersion_at: briefing.immersion_at,
      document_sent_at: briefing.document_sent_at,
      validated_at: briefing.validated_at,
      last_seen_at: briefing.last_seen_at,
      blocks: form.blocks,
      questions: form.questions,
      answers: answers.data.map((answer) => {
        const summary = summaryByAnswer.get(answer.id)
        return {
          id: answer.id,
          question_id: answer.question_id,
          snapshot: parseSnapshot(answer.question_snapshot),
          text: answer.text,
          value: answer.value,
          files: parseFiles(answer.files),
          skipped: answer.skipped,
          updated_at: answer.updated_at,
          filled_by_team: answer.filled_by_team,
          team_filled_at: answer.team_filled_at,
          by_client: answer.answered_by !== null,
          audios: audios.data
            .filter((audio) => audio.answer_id === answer.id)
            .map((audio) => {
              const transcription = transcriptionByAudio.get(audio.id)
              return {
                id: audio.id,
                path: audio.storage_path,
                duration_ms: audio.duration_ms,
                created_at: audio.created_at,
                transcription: transcription
                  ? { status: transcription.status, transcript: transcription.transcript, error: transcription.error }
                  : null,
              }
            }),
          summary: summary ? { status: summary.status, summary: summary.summary, error: summary.error } : null,
        }
      }),
      immersion: immersion.data
        ? {
            meeting_id: immersion.data.meeting_id,
            transcript: immersion.data.transcript ?? "",
            notes: immersion.data.notes ?? "",
            updated_at: immersion.data.updated_at,
          }
        : null,
  }
  detail.analysis = analysis.error || !analysis.data ? null : toAnalysis(detail, analysis.data)
  return { available: true, briefing: detail }
}

/** A análise guardada, com o aviso de que as respostas mudaram depois que ela leu. */
function toAnalysis(
  detail: TeamBriefingDetail,
  row: {
    status: TeamBriefingAnalysis["status"]
    attempts: number
    content: unknown
    error: string | null
    origin: string
    source_hash: string | null
    requested_at: string
    finished_at: string | null
  }
): TeamBriefingAnalysis {
  const content = parseAnalysisContent(row.content)
  const submitted = !isBriefingOpen(detail.status) && !isBriefingPreparing(detail.status)
  const stale =
    content !== null &&
    row.source_hash !== null &&
    analysisSourceHash(buildAnalysisSource(detail, detail.identification, submitted)) !== row.source_hash
  return {
    status: row.status,
    attempts: row.attempts,
    content,
    error: row.error,
    origin: row.origin === "manual" ? "manual" : "submitted",
    requested_at: row.requested_at,
    finished_at: row.finished_at,
    stale,
  }
}

/** A central: `available: false` antes da migration do briefing. */
export type BriefingCentralState = { available: false } | { available: true; central: BriefingCentral }

/*
 * Tudo da lista numa consulta só: os clientes com o briefing (um por
 * cliente) e, embutidas, as respostas com a quantidade de áudios e os
 * estados da IA. Sem a cópia da pergunta nem as transcrições: só o que a
 * conta do andamento usa. Depois, os formulários usados (uma leitura para
 * todos), para saber o que conta e o que é obrigatório.
 */
const CENTRAL_SELECT =
  "id, name, active, avatar_path, contact_name, instagram_handle, client_briefings(id, template_id, status, due_on, released_at, submitted_at, last_seen_at, briefing_answers(question_id, skipped, text, value, files, briefing_summaries(status), briefing_answer_audios(id, briefing_transcriptions(status))))"

export async function getBriefingCentral(today: DateKey): Promise<BriefingCentralState> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").select(CENTRAL_SELECT).order("name")
  if (error) {
    // Antes da migration, a relação embutida não existe (PGRST200).
    if (isMissingRelation(error) || error.code === "PGRST200") return { available: false }
    throw loadError(error, "os briefings")
  }

  const clients: CentralClient[] = data.map((client) => {
    // Um briefing por cliente (relação 1:1: vem o objeto ou null).
    const raw = client.client_briefings
    return {
      id: client.id,
      name: client.name,
      active: client.active,
      avatar_path: client.avatar_path,
      contact_name: client.contact_name,
      instagram_handle: client.instagram_handle,
      briefing: raw
        ? {
            id: raw.id,
            template_id: raw.template_id,
            status: raw.status,
            due_on: raw.due_on,
            released_at: raw.released_at,
            submitted_at: raw.submitted_at,
            last_seen_at: raw.last_seen_at,
            answers: raw.briefing_answers.map((answer) => {
              const summary = answer.briefing_summaries
              return {
                question_id: answer.question_id,
                skipped: answer.skipped,
                text: answer.text,
                value: answer.value,
                files: parseFiles(answer.files),
                audios: answer.briefing_answer_audios.length,
                ai: [
                  ...(summary ? [summary.status] : []),
                  ...answer.briefing_answer_audios.flatMap((audio) =>
                    audio.briefing_transcriptions ? [audio.briefing_transcriptions.status] : []
                  ),
                ],
              }
            }),
          }
        : null,
    }
  })

  const templateIds = [...new Set(clients.flatMap((client) => (client.briefing ? [client.briefing.template_id] : [])))]
  const form = await loadForms(supabase, templateIds)
  return { available: true, central: buildBriefingCentral(clients, form, today) }
}

/** O formulário ativo, para o editor de perguntas. */
export interface BriefingForm {
  template: { id: string; name: string; version: number }
  blocks: TeamBriefingBlock[]
  questions: TeamBriefingQuestion[]
  /** Quantas respostas cada pergunta já tem (a cópia na resposta guarda o texto de quando foi respondida). */
  answerCounts: Record<string, number>
}

export type BriefingFormState = { available: false } | { available: true; form: BriefingForm | null }

export async function getBriefingForm(): Promise<BriefingFormState> {
  await requireUser()
  const supabase = await createClient()
  const { data: template, error } = await supabase
    .from("briefing_templates")
    .select("id, name, version")
    .eq("active", true)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return { available: false }
    throw loadError(error, "o formulário do briefing")
  }
  if (!template) return { available: true, form: null }

  const form = await loadForm(supabase, template.id)
  const questionIds = form.questions.map((question) => question.id)
  const answers =
    questionIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("briefing_answers").select("question_id").in("question_id", questionIds)
  if (answers.error) throw loadError(answers.error, "o formulário do briefing")
  const answerCounts: Record<string, number> = {}
  for (const row of answers.data) answerCounts[row.question_id] = (answerCounts[row.question_id] ?? 0) + 1

  return { available: true, form: { template, ...form, answerCounts } }
}
