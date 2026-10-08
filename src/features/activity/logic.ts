import { formatMoney } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { addDaysToKey, formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import {
  COMMUNICATION_KIND_LABEL,
  CONTENT_FORMAT_LABEL,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_STAGE_LABEL,
  DEAL_STAGE_LABEL,
  FINANCE_ACCOUNT_LABEL,
  LEAD_SOURCE_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_AREA_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  isCommunicationKind,
  isContentFormat,
  isContentFrontStatus,
  isContentStage,
  isDealStage,
  isDecisionStatus,
  isFinanceAccount,
  isLeadSource,
  isProjectStatus,
  isTaskArea,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/labels"
import type { ActivityEntry, Client, DateKey, Profile, Project, Timestamp } from "@/lib/types"

/*
 * Histórico em frases: "concluiu a tarefa", "mudou o prazo de 10/10 para
 * 12/10", "atribuiu a Léo". Funções puras, sem React.
 */

export interface NameLookup {
  profileById: Map<string, Profile>
  clientById: Map<string, Client>
  projectById: Map<string, Project>
  today: DateKey
}

type Pair = [unknown, unknown]

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function quote(text: string): string {
  return `“${text}”`
}

function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`
}

function personName(id: unknown, names: NameLookup): string {
  const profile = typeof id === "string" ? names.profileById.get(id) : undefined
  return profile ? firstName(profile.full_name) : "alguém"
}

function dateLabel(value: unknown, names: NameLookup): string {
  const key = str(value)
  return key ? formatShortDate(key.slice(0, 10), names.today) : ""
}

function renamePhrase([before, after]: Pair): string | null {
  const next = str(after)
  if (!next) return null
  const previous = str(before)
  return previous ? `renomeou de ${quote(previous)} para ${quote(next)}` : `renomeou para ${quote(next)}`
}

/** Nos lançamentos e recorrências a descrição é o nome do item. */
function isNamedByDescription(entry: ActivityEntry): boolean {
  return entry.entity_type === "finance" || entry.entity_type === "recurrence"
}

function isRename(entry: ActivityEntry): boolean {
  const changes = entry.changes
  return "title" in changes || "name" in changes || "summary" in changes || (isNamedByDescription(entry) && "description" in changes)
}

function assigneeChange([before, after]: Pair, names: NameLookup): string | null {
  const old = Array.isArray(before) ? before.filter((id): id is string => typeof id === "string") : []
  const next = Array.isArray(after) ? after.filter((id): id is string => typeof id === "string") : []
  const added = next.filter((id) => !old.includes(id)).map((id) => personName(id, names))
  const removed = old.filter((id) => !next.includes(id)).map((id) => personName(id, names))
  const parts: string[] = []
  if (added.length > 0) parts.push(`atribuiu a ${joinPhrases(added)}`)
  if (removed.length > 0) parts.push(`tirou ${joinPhrases(removed)}`)
  return parts.length > 0 ? parts.join(" e ") : null
}

/** Frente do post: "mudou o status da copy para Em revisão". */
function frontPhrase(front: string, after: unknown): string | null {
  return isContentFrontStatus(after) ? `mudou o status ${front} para ${CONTENT_FRONT_STATUS_LABEL[after]}` : null
}

/** Uma frase por campo alterado (na ordem em que aparecem). */
function fieldPhrase(field: string, [before, after]: Pair, entry: ActivityEntry, names: NameLookup): string | null {
  const isProject = entry.entity_type === "project"
  switch (field) {
    case "status": {
      if (entry.entity_type === "task") {
        if (after === "done") return "concluiu"
        if (before === "done") return "reabriu"
        return isTaskStatus(after) ? `mudou o status para ${TASK_STATUS_LABEL[after]}` : null
      }
      if (isProject && isProjectStatus(after)) {
        if (after === "done") return "concluiu o projeto"
        if (after === "paused") return "pausou o projeto"
        if (after === "canceled") return "cancelou o projeto"
        if (after === "active" && (before === "paused" || before === "done" || before === "canceled")) return "retomou o projeto"
        return `mudou o status para ${PROJECT_STATUS_LABEL[after]}`
      }
      if (entry.entity_type === "decision" && isDecisionStatus(after)) {
        return after === "revoked" ? "revogou a decisão" : "reativou a decisão"
      }
      return null
    }
    case "stage": {
      if (entry.entity_type === "content_post") {
        if (!isContentStage(after)) return null
        return after === "published" ? "marcou como publicado" : `moveu para ${CONTENT_STAGE_LABEL[after]}`
      }
      if (!isDealStage(after)) return null
      if (after === "won") return "ganhou o negócio"
      if (after === "lost") return "marcou o negócio como perdido"
      if (before === "won" || before === "lost") return `reabriu o negócio em ${DEAL_STAGE_LABEL[after]}`
      return `moveu para ${DEAL_STAGE_LABEL[after]}`
    }
    case "title":
    case "name":
    case "summary":
      return renamePhrase([before, after])
    case "description":
      if (isNamedByDescription(entry)) return renamePhrase([before, after])
      return isProject ? "editou a descrição do projeto" : "editou a descrição"
    case "context":
      return "editou o contexto"
    case "due_date":
    case "due_on": {
      const label = isProject ? "o prazo do projeto" : "o prazo"
      if (!before) return `definiu ${label} para ${dateLabel(after, names)}`
      if (!after) return `tirou ${label}`
      return `mudou ${label} de ${dateLabel(before, names)} para ${dateLabel(after, names)}`
    }
    case "starts_on":
      return `mudou o começo para ${dateLabel(after, names)}`
    case "decided_on":
    case "occurred_on":
      return `mudou a data para ${dateLabel(after, names)}`
    case "priority":
      return isTaskPriority(after) ? `mudou a prioridade para ${TASK_PRIORITY_LABEL[after]}` : null
    case "area":
      return isTaskArea(after) ? `mudou a área para ${TASK_AREA_LABEL[after]}` : "tirou a área"
    case "client_id": {
      const client = typeof after === "string" ? names.clientById.get(after) : undefined
      return after ? `ligou ao cliente ${client?.name ?? ""}`.trim() : "tirou o cliente"
    }
    case "project_id": {
      const project = typeof after === "string" ? names.projectById.get(after) : undefined
      return after ? `moveu para o projeto ${project ? quote(project.name) : ""}`.trim() : "tirou do projeto"
    }
    case "owner_id":
      if (entry.entity_type === "deal") return after ? `passou o negócio para ${personName(after, names)}` : "deixou o negócio sem responsável"
      if (entry.entity_type === "content_post") return after ? `passou o post para ${personName(after, names)}` : "deixou o post sem responsável"
      return after ? `passou a responsabilidade para ${personName(after, names)}` : "deixou o projeto sem responsável"
    case "assignees":
      return assigneeChange([before, after], names)
    case "kind":
      return isCommunicationKind(after) ? `mudou o tipo para ${COMMUNICATION_KIND_LABEL[after]}` : null
    case "amount_cents":
      return typeof after === "number"
        ? `mudou o valor${typeof before === "number" ? ` de ${formatMoney(before)}` : ""} para ${formatMoney(after)}`
        : null
    case "paid_on":
      // Vale para receita e despesa ("baixa" = recebido ou pago).
      return after ? `deu baixa em ${dateLabel(after, names)}` : "desfez a baixa"
    case "skipped":
      return after === true ? "pulou este mês" : "voltou a contar este mês"
    case "day_of_month":
      return typeof after === "number" ? `mudou o vencimento para todo dia ${after}` : null
    case "ends_on":
      return after ? `encerrou a recorrência em ${dateLabel(after, names)}` : "tirou o fim da recorrência"
    case "category":
      return str(after) ? `mudou a subcategoria para ${str(after)}` : "tirou a subcategoria"
    case "account":
      return isFinanceAccount(after) ? `mudou a categoria para ${FINANCE_ACCOUNT_LABEL[after]}` : null
    case "fee_cents":
      return typeof after === "number" && after > 0 ? `registrou a taxa de ${formatMoney(after)}` : "tirou a taxa"
    case "recurring_cents":
      return typeof after === "number" ? `mudou o valor mensal para ${formatMoney(after)}` : null
    case "one_time_cents":
      return typeof after === "number" ? `mudou o valor pontual para ${formatMoney(after)}` : null
    case "term_months":
      return typeof after === "number" ? `mudou a duração para ${after} ${after === 1 ? "mês" : "meses"}` : "tirou a duração"
    case "expected_close_on":
      return after ? `mudou a previsão de fechamento para ${dateLabel(after, names)}` : "tirou a previsão de fechamento"
    case "source":
      return isLeadSource(after) ? `mudou a origem para ${LEAD_SOURCE_LABEL[after]}` : null
    case "lost_reason":
      return str(after) ? `registrou o motivo: ${quote(str(after)!)}` : null
    case "copy_status":
      return frontPhrase("da copy", after)
    case "design_status":
      return frontPhrase("do design", after)
    case "video_status":
      return frontPhrase("do vídeo", after)
    case "publish_on":
      if (!before) return `marcou a publicação para ${dateLabel(after, names)}`
      if (!after) return "tirou a data de publicação"
      return `mudou a publicação de ${dateLabel(before, names)} para ${dateLabel(after, names)}`
    case "format":
      return isContentFormat(after) ? `mudou o formato para ${CONTENT_FORMAT_LABEL[after]}` : null
    default:
      return null
  }
}

const ENTITY_NOUN: Record<ActivityEntry["entity_type"], string> = {
  task: "a tarefa",
  project: "o projeto",
  decision: "a decisão",
  communication: "a comunicação",
  finance: "o lançamento",
  recurrence: "a recorrência",
  deal: "o negócio",
  content_post: "o post",
}

const CREATED_VERB: Record<ActivityEntry["entity_type"], string> = {
  task: "criou a tarefa",
  project: "criou o projeto",
  decision: "registrou a decisão",
  communication: "registrou a comunicação",
  finance: "lançou",
  recurrence: "criou a recorrência",
  deal: "criou o negócio",
  content_post: "criou o post",
}

/**
 * O que a pessoa fez, sem o nome dela: "concluiu", "mudou o prazo de … para …".
 * `withTitle` inclui o item ("concluiu a tarefa “Layout da home”"), para as
 * linhas do tempo que misturam itens (projeto, cliente).
 */
export function describeActivity(entry: ActivityEntry, names: NameLookup, withTitle: boolean): string {
  const title = entry.entity_title ? quote(entry.entity_title) : ENTITY_NOUN[entry.entity_type]
  if (entry.action === "created") {
    if (entry.entity_type === "project" && !withTitle) return "criou o projeto"
    return withTitle || entry.entity_type === "finance" ? `${CREATED_VERB[entry.entity_type]} ${title}` : CREATED_VERB[entry.entity_type]
  }
  if (entry.action === "deleted") return `excluiu ${ENTITY_NOUN[entry.entity_type]} ${title}`
  if (entry.action === "comment") return withTitle ? `comentou em ${title}` : "comentou"

  const phrases = Object.entries(entry.changes)
    .map(([field, pair]) => fieldPhrase(field, pair, entry, names))
    .filter((phrase): phrase is string => Boolean(phrase))
  const what = phrases.length > 0 ? joinPhrases(phrases) : `editou ${ENTITY_NOUN[entry.entity_type]}`
  // Quando a linha do tempo mistura itens, a frase ganha o título do item
  // (menos no próprio projeto e quando a frase já traz o nome novo).
  if (!withTitle || entry.entity_type === "project" || isRename(entry)) return what
  return `${what} · ${title}`
}

/* ------------------------------------------------------------------ */
/* Agrupamento                                                         */
/* ------------------------------------------------------------------ */

export type FeedItem =
  | { kind: "entry"; entry: ActivityEntry }
  | { kind: "batch"; key: string; actorId: string | null; at: Timestamp; entries: ActivityEntry[] }

const BATCH_WINDOW_MS = 5 * 60 * 1000

/**
 * Tarefas criadas em sequência pela mesma pessoa (modelo de projeto,
 * checklist) viram um item só: "criou 15 tarefas".
 */
export function groupFeed(entries: ActivityEntry[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const entry of entries) {
    const last = items[items.length - 1]
    const isTaskCreation = entry.action === "created" && entry.entity_type === "task"
    if (isTaskCreation && last) {
      const lastEntry = last.kind === "batch" ? last.entries[last.entries.length - 1]! : last.entry
      const sameRun =
        lastEntry.action === "created" &&
        lastEntry.entity_type === "task" &&
        lastEntry.actor_id === entry.actor_id &&
        Math.abs(Date.parse(lastEntry.created_at) - Date.parse(entry.created_at)) <= BATCH_WINDOW_MS
      if (sameRun) {
        if (last.kind === "batch") last.entries.push(entry)
        else items[items.length - 1] = { kind: "batch", key: last.entry.id, actorId: entry.actor_id, at: last.entry.created_at, entries: [last.entry, entry] }
        continue
      }
    }
    items.push({ kind: "entry", entry })
  }
  return items
}

/* ------------------------------------------------------------------ */
/* Horário                                                             */
/* ------------------------------------------------------------------ */

/** "agora", "há 5 min", "hoje às 14:20", "ontem às 09:10", "02/10 às 18:00". */
export function relativeTime(instant: Timestamp, now: number, today: DateKey): string {
  const diff = now - Date.parse(instant)
  if (diff < 60_000) return "agora"
  if (diff < 60 * 60_000) return `há ${Math.floor(diff / 60_000)} min`
  const day = toDateKey(instant)
  const time = toTimeLabel(instant)
  if (day === today) return `hoje às ${time}`
  if (day === addDaysToKey(today, -1)) return `ontem às ${time}`
  return `${formatShortDate(day, today)} às ${time}`
}
