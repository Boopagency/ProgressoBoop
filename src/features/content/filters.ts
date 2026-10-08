import type { ContentFilters } from "@/features/content/logic"
import { isDateKey } from "@/lib/dates"
import { isContentFormat, isContentNetwork, isContentStage } from "@/lib/labels"
import type { ContentFormat, ContentNetwork, ContentStage, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Filtros e visão da tela Conteúdo na URL
 * (?cliente=a,b&pessoa=mine&rede=…&formato=…&etapa=…&ver=quadro|lista|feed|ideias&visao=semana&data=…),
 * para que um link ou um favorito abra a mesma tela. Listas separadas por
 * vírgula; valores desconhecidos são ignorados.
 */

export type ContentViewMode = "calendar" | "board" | "list" | "feed" | "ideas"
export type CalendarMode = "month" | "week"

export interface ContentUrlFilters {
  clients: string[]
  /** "all", "mine" ou o id de uma pessoa. */
  person: string
  networks: ContentNetwork[]
  formats: ContentFormat[]
  stages: ContentStage[]
}

export interface ContentUrlState {
  filters: ContentUrlFilters
  view: ContentViewMode
  calendar: CalendarMode
  /** Dia de referência do calendário (null = hoje). */
  anchor: DateKey | null
}

export const EMPTY_FILTERS: ContentUrlFilters = { clients: [], person: "all", networks: [], formats: [], stages: [] }

/** Modo na URL, em português. */
const VIEW_PARAM: Record<ContentViewMode, string> = { calendar: "calendario", board: "quadro", list: "lista", feed: "feed", ideas: "ideias" }

type SearchParams = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function list<T extends string>(value: string | string[] | undefined, valid: (item: unknown) => item is T): T[] {
  const raw = single(value)
  if (!raw) return []
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(valid))]
}

export function parseContentParams(params: SearchParams): ContentUrlState {
  const view = single(params.ver)
  const data = single(params.data)
  const person = single(params.pessoa)
  return {
    filters: {
      clients: list(params.cliente, isUuid),
      person: person === "mine" || isUuid(person) ? person : EMPTY_FILTERS.person,
      networks: list(params.rede, isContentNetwork),
      formats: list(params.formato, isContentFormat),
      stages: list(params.etapa, isContentStage),
    },
    view: (Object.entries(VIEW_PARAM).find(([, param]) => param === view)?.[0] as ContentViewMode | undefined) ?? "calendar",
    calendar: single(params.visao) === "semana" ? "week" : "month",
    anchor: isDateKey(data) ? data : null,
  }
}

export function contentQuery(state: ContentUrlState): string {
  const params = new URLSearchParams()
  const { filters } = state
  if (filters.clients.length > 0) params.set("cliente", filters.clients.join(","))
  if (filters.person !== EMPTY_FILTERS.person) params.set("pessoa", filters.person)
  if (filters.networks.length > 0) params.set("rede", filters.networks.join(","))
  if (filters.formats.length > 0) params.set("formato", filters.formats.join(","))
  if (filters.stages.length > 0) params.set("etapa", filters.stages.join(","))
  if (state.view !== "calendar") params.set("ver", VIEW_PARAM[state.view])
  if (state.calendar === "week") params.set("visao", "semana")
  if (state.anchor) params.set("data", state.anchor)
  // Vírgulas legíveis no endereço.
  return params.toString().replaceAll("%2C", ",")
}

export function hasActiveFilters(filters: ContentUrlFilters): boolean {
  return (
    filters.clients.length > 0 ||
    filters.person !== EMPTY_FILTERS.person ||
    filters.networks.length > 0 ||
    filters.formats.length > 0 ||
    filters.stages.length > 0
  )
}

/** Filtros da URL → filtros da lógica ("Meus" vira a pessoa logada). */
export function toContentFilters(filters: ContentUrlFilters, currentUserId: string): ContentFilters {
  return {
    clientIds: filters.clients,
    ownerId: filters.person === "all" ? undefined : filters.person === "mine" ? currentUserId : filters.person,
    networks: filters.networks,
    formats: filters.formats,
    stages: filters.stages,
  }
}
