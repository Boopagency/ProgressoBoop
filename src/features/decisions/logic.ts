import { includesText } from "@/lib/text"
import type { Decision, DecisionStatus, TaskArea } from "@/lib/types"

/* Regras das decisões: filtros e agrupamento por mês. Funções puras. */

export interface DecisionFilters {
  status: DecisionStatus | "all"
  area: TaskArea | "all"
  /** Cliente ("c:<id>"), projeto ("p:<id>") ou "all". */
  origin: string
  query: string
}

export const DEFAULT_DECISION_FILTERS: DecisionFilters = { status: "active", area: "all", origin: "all", query: "" }

export function filterDecisions(decisions: Decision[], filters: DecisionFilters): Decision[] {
  return decisions.filter((decision) => {
    if (filters.status !== "all" && decision.status !== filters.status) return false
    if (filters.area !== "all" && decision.area !== filters.area) return false
    if (filters.origin.startsWith("c:") && decision.client_id !== filters.origin.slice(2)) return false
    if (filters.origin.startsWith("p:") && decision.project_id !== filters.origin.slice(2)) return false
    if (filters.query.trim()) {
      const text = `${decision.title}\n${decision.context ?? ""}`
      if (!includesText(text, filters.query)) return false
    }
    return true
  })
}

/** Mais recente primeiro: data da decisão, depois a hora do registro. */
export function compareDecisions(a: Decision, b: Decision): number {
  if (a.decided_on !== b.decided_on) return a.decided_on < b.decided_on ? 1 : -1
  return b.created_at.localeCompare(a.created_at)
}

/** Grupos por mês ("2026-10"), na ordem da lista. */
export function groupByMonth(decisions: Decision[]): { month: string; decisions: Decision[] }[] {
  const groups: { month: string; decisions: Decision[] }[] = []
  for (const decision of [...decisions].sort(compareDecisions)) {
    const month = decision.decided_on.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.decisions.push(decision)
    else groups.push({ month, decisions: [decision] })
  }
  return groups
}
