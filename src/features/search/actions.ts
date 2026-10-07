"use server"

import { requireUser } from "@/features/auth/session"
import { getEvents } from "@/features/calendar/queries"
import { periodOf, periodParam } from "@/features/clients/logic"
import { getClients } from "@/features/clients/queries"
import { getCommunications } from "@/features/communications/queries"
import { getDecisions } from "@/features/decisions/queries"
import { matchesQuick } from "@/features/docs/logic"
import { getDocs, searchDocs } from "@/features/docs/queries"
import { getFinance } from "@/features/finance/queries"
import { formatMoney } from "@/features/finance/money"
import { meetingsOverview, type MeetingEntry } from "@/features/meetings/logic"
import { getMeetingRecords, searchMeetingIds } from "@/features/meetings/queries"
import { isDone } from "@/features/tasks/logic"
import { getTasks } from "@/features/tasks/queries"
import { getWorkspace } from "@/features/workspace/queries"
import { formatShortDate, todayKey } from "@/lib/dates"
import { COMMUNICATION_KIND_LABEL, PROJECT_STATUS_LABEL } from "@/lib/labels"
import { includesText } from "@/lib/text"
import type { DateKey, TaskStatus } from "@/lib/types"

/*
 * Busca geral (Ctrl/⌘ + K): tarefas, projetos, reuniões, decisões,
 * processos, clientes, comunicações e lançamentos. O volume é pequeno, então
 * títulos e nomes são filtrados aqui (sem acento); textos longos (processos,
 * resumos e transcrições) usam a busca do Postgres.
 */

const QUERY_MAX = 120

export interface SearchResults {
  tasks: { id: string; title: string; status: TaskStatus; due_date: DateKey | null; client_id: string | null }[]
  meetings: {
    key: string
    title: string
    date: DateKey
    recordId: string | null
    eventId: string
    detail: string | null
  }[]
  docs: { id: string; title: string; detail: string | null }[]
  clients: { id: string; name: string; active: boolean }[]
  projects: { id: string; name: string; detail: string }[]
  decisions: { id: string; title: string; detail: string }[]
  communications: { id: string; summary: string; clientId: string; detail: string }[]
  finance: { key: string; description: string; href: string; detail: string }[]
}

const EMPTY: SearchResults = {
  tasks: [],
  meetings: [],
  docs: [],
  clients: [],
  projects: [],
  decisions: [],
  communications: [],
  finance: [],
}

export async function searchEverything(rawQuery: string): Promise<SearchResults> {
  await requireUser()
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, QUERY_MAX) : ""
  if (query.length < 2) return EMPTY
  // A busca textual do banco só vale a pena com algumas letras.
  const fullText = query.length >= 3

  const [tasks, events, { records, items }, docs, clients, docHits, meetingHits, workspace, decisions, communications, finance] =
    await Promise.all([
      getTasks(),
      getEvents(),
      getMeetingRecords(),
      getDocs(),
      getClients(),
      fullText ? searchDocs(query) : Promise.resolve([]),
      fullText ? searchMeetingIds(query) : Promise.resolve(new Set<string>()),
      getWorkspace(),
      getDecisions(),
      getCommunications(),
      getFinance(),
    ])
  const today = todayKey()
  const clientName = new Map(clients.map((client) => [client.id, client.name]))

  const taskResults = tasks
    .filter((task) => includesText(task.title, query) || (task.description ? includesText(task.description, query) : false))
    .sort((a, b) => Number(isDone(a)) - Number(isDone(b)))
    .slice(0, 6)
    .map(({ id, title, status, due_date, client_id }) => ({ id, title, status, due_date, client_id }))

  const snippetById = new Map(docHits.map((hit) => [hit.id, hit.snippet]))
  const docResults = docs
    .filter((doc) => matchesQuick(doc, query) || snippetById.has(doc.id))
    .sort((a, b) => Number(matchesQuick(b, query)) - Number(matchesQuick(a, query)))
    .slice(0, 6)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      detail: matchesQuick(doc, query) ? doc.summary : (snippetById.get(doc.id) ?? null),
    }))

  // Reuniões: as próximas (uma por série) e as registradas, a mais nova primeiro.
  const overview = meetingsOverview(events, records, today, { horizonDays: 35, lookbackDays: 0 })
  const itemsByMeeting = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByMeeting.get(item.meeting_id) ?? []
    list.push(item)
    itemsByMeeting.set(item.meeting_id, list)
  }
  function matchOf(entry: MeetingEntry): string | null | undefined {
    const client = entry.event.client_id ? clientName.get(entry.event.client_id) : undefined
    if (includesText(entry.event.title, query) || (client && includesText(client, query))) return null
    if (!entry.record) return undefined
    const item = itemsByMeeting.get(entry.record.id)?.find((candidate) => includesText(candidate.content, query))
    if (item) return `${item.kind === "topic" ? "Assunto" : "Combinado"}: ${item.content}`
    if (meetingHits.has(entry.record.id)) return "Encontrado no resumo ou na transcrição"
    if (entry.record.summary && includesText(entry.record.summary, query)) return entry.record.summary
    return undefined
  }
  const seenSeries = new Set<string>()
  const meetingResults: SearchResults["meetings"] = []
  for (const entry of [...overview.upcoming, ...overview.history]) {
    if (meetingResults.length >= 6) break
    const detail = matchOf(entry)
    if (detail === undefined) continue
    // Das próximas sem registro, só a primeira de cada série.
    if (!entry.record) {
      if (seenSeries.has(entry.event.id)) continue
      seenSeries.add(entry.event.id)
    }
    meetingResults.push({
      key: entry.key,
      title: entry.event.title,
      date: entry.date,
      recordId: entry.record?.id ?? null,
      eventId: entry.event.id,
      detail,
    })
  }

  const clientResults = clients
    .filter((client) => includesText(client.name, query))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5)
    .map(({ id, name, active }) => ({ id, name, active }))

  const projectResults = workspace.projects
    .filter((project) => {
      const client = project.client_id ? clientName.get(project.client_id) : undefined
      return includesText(project.name, query) || (client ? includesText(client, query) : false)
    })
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      name: project.name,
      detail: [project.client_id ? clientName.get(project.client_id) : "Interno", PROJECT_STATUS_LABEL[project.status]]
        .filter(Boolean)
        .join(" · "),
    }))

  const decisionResults = decisions
    .filter((decision) => includesText(decision.title, query) || (decision.context ? includesText(decision.context, query) : false))
    .slice(0, 5)
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      detail: `${formatShortDate(decision.decided_on, today)}${decision.status === "revoked" ? " · revogada" : ""}`,
    }))

  const communicationResults = communications
    .filter((item) => {
      const client = clientName.get(item.client_id) ?? ""
      return includesText(item.summary, query) || includesText(client, query) || (item.details ? includesText(item.details, query) : false)
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      summary: item.summary,
      clientId: item.client_id,
      detail: [COMMUNICATION_KIND_LABEL[item.kind], clientName.get(item.client_id), formatShortDate(item.occurred_on, today)]
        .filter(Boolean)
        .join(" · "),
    }))

  // Lançamentos: avulsos pelo vencimento; recorrências levam ao mês atual.
  const financeResults: SearchResults["finance"] = [
    ...finance.recurrences
      .filter((recurrence) => includesText(recurrence.description, query))
      .map((recurrence) => ({
        key: `r-${recurrence.id}`,
        description: recurrence.description,
        href: "/financeiro",
        detail: `${formatMoney(recurrence.amount_cents)} todo mês, dia ${recurrence.day_of_month}`,
      })),
    ...finance.entries
      .filter((entry) => !entry.recurrence_id && includesText(entry.description, query))
      .sort((a, b) => b.due_on.localeCompare(a.due_on))
      .map((entry) => ({
        key: entry.id,
        description: entry.description,
        href: `/financeiro?mes=${periodParam(periodOf(entry.due_on))}`,
        detail: `${formatMoney(entry.amount_cents)} · ${entry.paid_on ? "quitado" : "vence"} ${formatShortDate(entry.paid_on ?? entry.due_on, today)}`,
      })),
  ].slice(0, 5)

  return {
    tasks: taskResults,
    meetings: meetingResults,
    docs: docResults,
    clients: clientResults,
    projects: projectResults,
    decisions: decisionResults,
    communications: communicationResults,
    finance: financeResults,
  }
}
