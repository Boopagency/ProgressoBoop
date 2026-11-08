import { buildBriefingCentral, type CentralAnswer, type CentralClient, type CentralForm } from "@/features/briefing/central-logic"
import type { TeamBriefingAnswer } from "@/features/briefing/team-logic"
import { addDaysToKey } from "@/lib/dates"
import type { BriefingStatus, DateKey } from "@/lib/types"

import { VB_BRIEFING_BLOCKS, VB_BRIEFING_CLIENT, VB_BRIEFING_QUESTIONS, vbBriefing } from "../briefing-equipe/fixtures"

/*
 * Central de briefings de exemplo (só a vitrine): vários clientes, cada um
 * num status, com atraso, IA pendente e com falha, obrigatórias em aberto e
 * clientes ativos sem briefing.
 */

const TEMPLATE = "t1"

function toCentral(answer: TeamBriefingAnswer): CentralAnswer {
  return {
    question_id: answer.question_id,
    skipped: answer.skipped,
    text: answer.text,
    value: answer.value,
    files: answer.files,
    audios: answer.audios.length,
    ai: [
      ...(answer.summary ? [answer.summary.status] : []),
      ...answer.audios.flatMap((audio) => (audio.transcription ? [audio.transcription.status] : [])),
    ],
  }
}

/** Respostas do Café Aurora; `ready` tira as pendências da IA (briefing já processado). */
function answersOf(today: DateKey, questions: string[] | "all", ready = false): CentralAnswer[] {
  const all = vbBriefing(today, "submitted").answers.map(toCentral)
  const picked = questions === "all" ? all : all.filter((answer) => questions.includes(answer.question_id))
  return ready ? picked.map((answer) => ({ ...answer, ai: answer.ai.map(() => "ready" as const) })) : picked
}

const at = (today: DateKey, days: number, time: string) => `${addDaysToKey(today, days)}T${time}:00.000-03:00`

function client(
  id: string,
  name: string,
  briefing: { status: BriefingStatus; due: number; seen: [number, string] | null; submitted?: number; answers: CentralAnswer[] } | null,
  today: DateKey,
  active = true
): CentralClient {
  return {
    id: `00000000-0000-4000-8000-0000000000${id}`,
    name,
    active,
    avatar_path: null,
    contact_name: null,
    instagram_handle: null,
    briefing: briefing
      ? {
          id: `00000000-0000-4000-8000-00000000bf${id}`,
          template_id: TEMPLATE,
          status: briefing.status,
          due_on: addDaysToKey(today, briefing.due),
          released_at: at(today, briefing.due - 7, "10:00"),
          submitted_at: briefing.submitted === undefined ? null : at(today, briefing.submitted, "21:40"),
          last_seen_at: briefing.seen ? at(today, briefing.seen[0], briefing.seen[1]) : null,
          answers: briefing.answers,
        }
      : null,
  }
}

export function vbCentralClients(today: DateKey): CentralClient[] {
  const half = ["q0", "q1", "q2", "q3", "q4", "q5", "q7"]
  return [
    { ...client("a1", "Café Aurora", { status: "submitted", due: -1, seen: [-1, "21:42"], submitted: -1, answers: answersOf(today, "all") }, today), id: VB_BRIEFING_CLIENT },
    client("a2", "Studio Norte", { status: "in_progress", due: -3, seen: [-4, "09:15"], answers: answersOf(today, ["q0", "q1", "q3"], true) }, today),
    client("a3", "Vela Arquitetura", { status: "in_progress", due: 3, seen: [0, "11:08"], answers: answersOf(today, half) }, today),
    client("a4", "Clínica Lume", { status: "not_started", due: 0, seen: null, answers: [] }, today),
    client("a5", "Maré Surf Shop", { status: "preparing", due: 5, seen: null, answers: answersOf(today, ["q0", "q11", "q12"], true) }, today),
    client("a8", "Ateliê Ninho", { status: "immersion_done", due: -9, seen: [-6, "16:30"], submitted: -8, answers: answersOf(today, "all", true) }, today),
    client("a9", "Horta Viva", { status: "document_sent", due: -20, seen: [-12, "10:02"], submitted: -18, answers: answersOf(today, "all", true) }, today),
    client("b1", "Pátio Verde", { status: "submitted", due: 1, seen: [0, "08:47"], submitted: 0, answers: answersOf(today, ["q0", "q1", "q2", "q3", "q4", "q6", "q8", "q9"], true) }, today),
    client("a7", "Padaria Trigo", { status: "validated", due: -40, seen: [-30, "14:20"], submitted: -38, answers: answersOf(today, "all", true) }, today, false),
    client("a6", "Boop", null, today),
    client("b2", "Forno a Lenha", null, today),
    client("b3", "Oficina Brava", null, today),
  ]
}

export function vbCentralForm(): CentralForm {
  return { blocks: VB_BRIEFING_BLOCKS.map((block) => ({ ...block, template_id: TEMPLATE })), questions: VB_BRIEFING_QUESTIONS }
}

export function vbCentral(today: DateKey) {
  return buildBriefingCentral(vbCentralClients(today), vbCentralForm(), today)
}
