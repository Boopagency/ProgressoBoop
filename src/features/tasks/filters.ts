import {
  DEFAULT_FILTERS,
  type DueFilter,
  type StatusFilter,
  type TaskFilters,
  type TaskViewMode,
} from "@/features/tasks/logic"
import { isTaskArea } from "@/lib/labels"

/**
 * Filtros e modo da tela Tarefas na URL
 * (?pessoa=…&status=…&area=…&cliente=…&projeto=…&prazo=…&ver=…), para que um
 * recarregamento, um link ou uma visão salva mantenham a mesma tela.
 */

const STATUS_VALUES: StatusFilter[] = ["open", "todo", "doing", "done", "all"]
const DUE_VALUES: DueFilter[] = ["any", "overdue", "today", "week", "later", "undated"]

/** Modo de exibição na URL, em português. */
const VIEW_PARAM: Record<TaskViewMode, string> = { list: "lista", table: "tabela", board: "quadro" }

type SearchParams = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Lê os filtros da URL. Pessoa, cliente e projeto são validados no cliente,
 * contra a equipe, os clientes e os projetos.
 */
export function filtersFromSearchParams(params: SearchParams): TaskFilters {
  const status = single(params.status)
  const area = single(params.area)
  const due = single(params.prazo)
  return {
    person: single(params.pessoa) ?? DEFAULT_FILTERS.person,
    status: STATUS_VALUES.find((value) => value === status) ?? DEFAULT_FILTERS.status,
    area: isTaskArea(area) ? area : DEFAULT_FILTERS.area,
    client: single(params.cliente) ?? DEFAULT_FILTERS.client,
    project: single(params.projeto) ?? DEFAULT_FILTERS.project,
    due: DUE_VALUES.find((value) => value === due) ?? DEFAULT_FILTERS.due,
  }
}

export function viewModeFromSearchParams(params: SearchParams): TaskViewMode {
  const value = single(params.ver)
  const entry = Object.entries(VIEW_PARAM).find(([, param]) => param === value)
  return (entry?.[0] as TaskViewMode | undefined) ?? "list"
}

export function filtersToQuery(filters: TaskFilters, view: TaskViewMode = "list"): string {
  const params = new URLSearchParams()
  if (filters.person !== DEFAULT_FILTERS.person) params.set("pessoa", filters.person)
  if (filters.status !== DEFAULT_FILTERS.status) params.set("status", filters.status)
  if (filters.area !== DEFAULT_FILTERS.area) params.set("area", filters.area)
  if (filters.client !== DEFAULT_FILTERS.client) params.set("cliente", filters.client)
  if (filters.project !== DEFAULT_FILTERS.project) params.set("projeto", filters.project)
  if (filters.due !== DEFAULT_FILTERS.due) params.set("prazo", filters.due)
  if (view !== "list") params.set("ver", VIEW_PARAM[view])
  return params.toString()
}

/** A mesma visão escrita de outro jeito (ordem dos parâmetros) conta como igual. */
export function sameQuery(a: string, b: string): boolean {
  const normalize = (query: string) => {
    const params = new URLSearchParams(query)
    params.sort()
    return params.toString()
  }
  return normalize(a) === normalize(b)
}
