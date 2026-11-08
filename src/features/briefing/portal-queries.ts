import "server-only"

import {
  parseAnswerValue,
  parseFiles,
  parseOptions,
  type FlowAnswer,
  type FlowBlock,
  type FlowData,
  type QuestionKind,
} from "@/features/briefing/flow-logic"
import { parseIdentification } from "@/features/briefing/logic"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/**
 * O briefing do cliente para o fluxo do portal: as etapas e perguntas ativas
 * do modelo, as respostas com os áudios e onde parou. Pelo RLS, só o da
 * conta. Sem briefing liberado (ou antes da migration), null.
 */
export async function getPortalBriefingFlow(clientId: string): Promise<FlowData | null> {
  await requirePortalUser()
  const supabase = await createClient()
  const { data: briefing, error } = await supabase
    .from("client_briefings")
    .select("id, client_id, template_id, status, due_on, identification, current_question_id, completed_block_ids")
    .eq("client_id", clientId)
    .maybeSingle()
  if (error) {
    console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    return null
  }
  if (!briefing) return null

  const [blocks, questions, answers, audios] = await Promise.all([
    supabase
      .from("briefing_blocks")
      .select("id, title, description, estimated_minutes, position")
      .eq("template_id", briefing.template_id)
      .eq("active", true)
      .order("position"),
    supabase
      .from("briefing_questions")
      .select("id, block_id, key, text, hint, kind, options, required, position, briefing_blocks!inner(template_id)")
      .eq("active", true)
      .eq("briefing_blocks.template_id", briefing.template_id)
      .order("position"),
    supabase.from("briefing_answers").select("id, question_id, text, value, files, skipped, filled_by_team").eq("briefing_id", briefing.id),
    supabase
      .from("briefing_answer_audios")
      .select("id, answer_id, duration_ms, created_at")
      .eq("briefing_id", briefing.id)
      .order("created_at"),
  ])
  for (const result of [blocks, questions, answers, audios]) {
    if (result.error) throw loadError(result.error, "o briefing")
  }

  const byBlock = new Map<string, FlowBlock["questions"]>()
  for (const row of questions.data ?? []) {
    const list = byBlock.get(row.block_id) ?? []
    list.push({
      id: row.id,
      key: row.key,
      text: row.text,
      hint: row.hint,
      kind: row.kind as QuestionKind,
      options: parseOptions(row.options),
      required: row.required,
    })
    byBlock.set(row.block_id, list)
  }

  const audiosByAnswer = new Map<string, FlowAnswer["audios"]>()
  for (const row of audios.data ?? []) {
    const list = audiosByAnswer.get(row.answer_id) ?? []
    list.push({ id: row.id, duration_ms: row.duration_ms, created_at: row.created_at })
    audiosByAnswer.set(row.answer_id, list)
  }

  const flowAnswers: Record<string, FlowAnswer> = {}
  for (const row of answers.data ?? []) {
    flowAnswers[row.question_id] = {
      text: row.text ?? "",
      value: parseAnswerValue(row.value),
      files: parseFiles(row.files),
      skipped: row.skipped,
      audios: audiosByAnswer.get(row.id) ?? [],
      prefilled: row.filled_by_team,
    }
  }

  const identification = parseIdentification(briefing.identification)
  return {
    briefingId: briefing.id,
    clientId: briefing.client_id,
    status: briefing.status,
    dueOn: briefing.due_on,
    currentQuestionId: briefing.current_question_id,
    completedBlockIds: briefing.completed_block_ids,
    identification: { ...identification },
    blocks: (blocks.data ?? []).map((block) => ({
      id: block.id,
      title: block.title,
      description: block.description,
      estimated_minutes: block.estimated_minutes,
      questions: byBlock.get(block.id) ?? [],
    })),
    answers: flowAnswers,
  }
}
