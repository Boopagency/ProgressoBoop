import { addDaysToKey, formatMonthYear, weekRangeOf } from "@/lib/dates"
import { includesText } from "@/lib/text"
import type { Communication, CommunicationKind, DateKey } from "@/lib/types"

/* Regras das comunicações: filtros e agrupamento por período. Funções puras. */

export interface CommunicationFilters {
  client: string | "all"
  kind: CommunicationKind | "all"
  query: string
}

export const DEFAULT_COMMUNICATION_FILTERS: CommunicationFilters = { client: "all", kind: "all", query: "" }

export function filterCommunications(list: Communication[], filters: CommunicationFilters): Communication[] {
  return list.filter((item) => {
    if (filters.client !== "all" && item.client_id !== filters.client) return false
    if (filters.kind !== "all" && item.kind !== filters.kind) return false
    if (filters.query.trim() && !includesText(`${item.summary}\n${item.details ?? ""}`, filters.query)) return false
    return true
  })
}

export function compareCommunications(a: Communication, b: Communication): number {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
  return b.created_at.localeCompare(a.created_at)
}

/** "Hoje", "Ontem", "Esta semana", "Semana passada" e depois por mês. */
export function periodLabel(day: DateKey, today: DateKey): string {
  if (day === today) return "Hoje"
  if (day === addDaysToKey(today, -1)) return "Ontem"
  const week = weekRangeOf(today)
  if (day >= week.start && day <= today) return "Esta semana"
  if (day >= addDaysToKey(week.start, -7) && day < week.start) return "Semana passada"
  if (day > today) return "Agendadas"
  return formatMonthYear(day)
}

export function groupByPeriod(list: Communication[], today: DateKey): { label: string; items: Communication[] }[] {
  const groups: { label: string; items: Communication[] }[] = []
  for (const item of [...list].sort(compareCommunications)) {
    const label = periodLabel(item.occurred_on, today)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
