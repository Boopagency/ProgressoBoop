import {
  DEFAULT_FILTERS,
  type DueFilter,
  type StatusFilter,
  type TaskFilters,
} from "@/features/tasks/logic"
import { isTaskArea } from "@/lib/labels"

/**
 * Filtros da tela Tarefas na URL (?pessoa=…&status=…&area=…&cliente=…&prazo=…),
 * para que um recarregamento ou link mantenha a mesma visão.
 */

const STATUS_VALUES: StatusFilter[] = ["open", "todo", "doing", "done", "all"]
const DUE_VALUES: DueFilter[] = ["any", "overdue", "today", "week", "later", "undated"]

type SearchParams = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Lê os filtros da URL. Pessoa e cliente são validados no cliente, contra a equipe. */
export function filtersFromSearchParams(params: SearchParams): TaskFilters {
  const status = single(params.status)
  const area = single(params.area)
  const due = single(params.prazo)
  return {
    person: single(params.pessoa) ?? DEFAULT_FILTERS.person,
    status: STATUS_VALUES.find((value) => value === status) ?? DEFAULT_FILTERS.status,
    area: isTaskArea(area) ? area : DEFAULT_FILTERS.area,
    client: single(params.cliente) ?? DEFAULT_FILTERS.client,
    due: DUE_VALUES.find((value) => value === due) ?? DEFAULT_FILTERS.due,
  }
}

export function filtersToQuery(filters: TaskFilters): string {
  const params = new URLSearchParams()
  if (filters.person !== DEFAULT_FILTERS.person) params.set("pessoa", filters.person)
  if (filters.status !== DEFAULT_FILTERS.status) params.set("status", filters.status)
  if (filters.area !== DEFAULT_FILTERS.area) params.set("area", filters.area)
  if (filters.client !== DEFAULT_FILTERS.client) params.set("cliente", filters.client)
  if (filters.due !== DEFAULT_FILTERS.due) params.set("prazo", filters.due)
  return params.toString()
}
