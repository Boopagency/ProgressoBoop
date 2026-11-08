import { dueState, isBriefingOpen, type BriefingIdentification } from "@/features/briefing/logic"
import {
  buildBriefingView,
  type BriefingAiStatus,
  type BriefingFile,
  type TeamBriefingBlock,
  type TeamBriefingQuestion,
} from "@/features/briefing/team-logic"
import { daysBetween } from "@/lib/dates"
import type { BriefingStatus, DateKey, Timestamp } from "@/lib/types"

/*
 * Central de briefings (`/briefing`): uma linha por cliente com o que a
 * equipe precisa para decidir o que fazer primeiro. Funções puras; a leitura
 * (`getBriefingCentral`) traz tudo numa consulta só e a conta é feita aqui,
 * com as mesmas regras da aba do cliente (`buildBriefingView`).
 */

/** O que a consulta da central traz de cada resposta (sem a cópia da pergunta). */
export interface CentralAnswer {
  question_id: string
  skipped: boolean
  text: string | null
  value: unknown
  files: BriefingFile[]
  audios: number
  /** Estados da IA desta resposta: o resumo e a transcrição de cada áudio. */
  ai: BriefingAiStatus[]
}

export interface CentralBriefing {
  id: string
  template_id: string
  status: BriefingStatus
  due_on: DateKey
  released_at: Timestamp
  submitted_at: Timestamp | null
  last_seen_at: Timestamp | null
  answers: CentralAnswer[]
}

export interface CentralClient {
  id: string
  name: string
  active: boolean
  avatar_path: string | null
  contact_name: string | null
  instagram_handle: string | null
  briefing: CentralBriefing | null
}

export interface CentralForm {
  blocks: (TeamBriefingBlock & { template_id: string })[]
  questions: TeamBriefingQuestion[]
}

/** IA do briefing: algo falhou (pede olhar) ou ainda está na fila. */
export type CentralAi = "failed" | "pending" | null

export interface BriefingRow {
  clientId: string
  name: string
  avatarPath: string | null
  active: boolean
  briefingId: string
  status: BriefingStatus
  dueOn: DateKey
  /** Só enquanto aberto (liberado e não enviado). */
  due: "ok" | "today" | "late" | null
  /** Dias de atraso (só quando `due` é "late"). */
  lateDays: number
  submittedAt: Timestamp | null
  lastSeenAt: Timestamp | null
  answered: number
  total: number
  percent: number
  missingRequired: number
  ai: CentralAi
  /** Grupo da ordem (0 vem primeiro); `ACTION_GROUPS` pedem ação da equipe. */
  priority: number
}

/**
 * Ordem da central: o que pede ação primeiro. Enviado esperando a imersão,
 * depois atrasado, depois em preenchimento; o resto segue a sequência.
 */
export const PRIORITY = {
  submitted: 0,
  late: 1,
  in_progress: 2,
  not_started: 3,
  preparing: 4,
  immersion_done: 5,
  document_sent: 6,
  validated: 7,
} as const

/** Grupos que pedem ação da equipe agora (enviado, atrasado). */
export const ACTION_PRIORITIES: readonly number[] = [PRIORITY.submitted, PRIORITY.late]

export function needsAction(row: Pick<BriefingRow, "priority">): boolean {
  return ACTION_PRIORITIES.includes(row.priority)
}

export function briefingPriority(status: BriefingStatus, due: BriefingRow["due"]): number {
  if (due === "late") return PRIORITY.late
  return PRIORITY[status]
}

/** O pior estado da IA: uma falha pede olhar; pendente ou processando, ainda na fila. */
export function aggregateAi(statuses: readonly BriefingAiStatus[]): CentralAi {
  if (statuses.includes("failed")) return "failed"
  if (statuses.some((status) => status === "pending" || status === "processing")) return "pending"
  return null
}

const EMPTY_SNAPSHOT = { text: null, hint: null, kind: null, options: {}, required: null, block_title: null }

/** Uma linha da central, com as contas da aba do cliente. */
export function buildBriefingRow(client: CentralClient & { briefing: CentralBriefing }, form: CentralForm, today: DateKey): BriefingRow {
  const briefing = client.briefing
  const view = buildBriefingView({
    blocks: form.blocks.filter((block) => block.template_id === briefing.template_id),
    questions: form.questions,
    submitted_at: briefing.submitted_at,
    answers: briefing.answers.map((answer, index) => ({
      id: `${briefing.id}:${index}`,
      question_id: answer.question_id,
      snapshot: EMPTY_SNAPSHOT,
      text: answer.text,
      value: answer.value,
      files: answer.files,
      skipped: answer.skipped,
      updated_at: briefing.released_at,
      filled_by_team: false,
      team_filled_at: null,
      by_client: false,
      // Só a quantidade importa para saber se foi respondida.
      audios: Array.from({ length: answer.audios }, (_, n) => ({
        id: `${index}:${n}`,
        path: "",
        duration_ms: 0,
        created_at: briefing.released_at,
        transcription: null,
      })),
      summary: null,
    })),
  })
  const due = dueState(briefing, today)
  return {
    clientId: client.id,
    name: client.name,
    avatarPath: client.avatar_path,
    active: client.active,
    briefingId: briefing.id,
    status: briefing.status,
    dueOn: briefing.due_on,
    due,
    lateDays: due === "late" ? daysBetween(briefing.due_on, today) : 0,
    submittedAt: briefing.submitted_at,
    lastSeenAt: briefing.last_seen_at,
    answered: view.progress.answered,
    total: view.progress.total,
    percent: view.progress.percent,
    missingRequired: view.progress.missing.length,
    ai: aggregateAi(briefing.answers.flatMap((answer) => answer.ai)),
    priority: briefingPriority(briefing.status, due),
  }
}

/** Dentro do mesmo grupo: o que espera há mais tempo primeiro. */
function waitingSince(row: BriefingRow): string {
  if (row.status === "submitted") return row.submittedAt ?? ""
  if (isBriefingOpen(row.status)) return row.dueOn
  return ""
}

export function compareBriefingRows(a: BriefingRow, b: BriefingRow): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  const wait = waitingSince(a).localeCompare(waitingSince(b))
  if (wait !== 0) return wait
  return a.name.localeCompare(b.name, "pt-BR")
}

export interface BriefingCentral {
  rows: BriefingRow[]
  /** Clientes ativos sem briefing (para preparar). */
  withoutBriefing: { id: string; name: string; avatarPath: string | null; defaults: BriefingIdentification }[]
}

/** Dados que a ficha já tem, para a identificação (bloco 0) ao preparar ou liberar. */
export function briefingDefaults(client: Pick<CentralClient, "name" | "contact_name" | "instagram_handle">): BriefingIdentification {
  return {
    brand_name: client.name,
    contact_name: client.contact_name ?? "",
    region: "",
    instagram: client.instagram_handle ? `@${client.instagram_handle.replace(/^@/, "")}` : "",
    site: "",
  }
}

export function buildBriefingCentral(clients: CentralClient[], form: CentralForm, today: DateKey): BriefingCentral {
  const rows: BriefingRow[] = []
  const withoutBriefing: BriefingCentral["withoutBriefing"] = []
  for (const client of clients) {
    if (client.briefing) rows.push(buildBriefingRow({ ...client, briefing: client.briefing }, form, today))
    else if (client.active) withoutBriefing.push({ id: client.id, name: client.name, avatarPath: client.avatar_path, defaults: briefingDefaults(client) })
  }
  rows.sort(compareBriefingRows)
  withoutBriefing.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  return { rows, withoutBriefing }
}

/* ------------------------------------------------------------------ */
/* Filtro e busca                                                      */
/* ------------------------------------------------------------------ */

/** Filtro da central: todos, só os que pedem ação, ou um status. */
export type CentralFilter = "all" | "action" | BriefingStatus

/** Sem acento e em minúsculas, para a busca por nome. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim()
}

export function matchesFilter(row: BriefingRow, filter: CentralFilter): boolean {
  if (filter === "all") return true
  if (filter === "action") return needsAction(row)
  return row.status === filter
}

export function filterBriefingRows(rows: readonly BriefingRow[], filter: CentralFilter, query: string): BriefingRow[] {
  const needle = normalizeSearch(query)
  return rows.filter((row) => matchesFilter(row, filter) && (!needle || normalizeSearch(row.name).includes(needle)))
}
