import { COLLAPSIBLE_STAGES } from "@/features/deals/logic"
import type { DealStage } from "@/lib/types"

/** Etapas recolhidas no quadro do Comercial (preferência de cada pessoa, em cookie). */
export const DEALS_COLLAPSED_COOKIE = "boop_comercial_recolhidas"

/** Sem cookie, pré-venda e saída começam recolhidas; "-" quer dizer nenhuma. */
export function parseCollapsedStages(value: string | undefined): DealStage[] {
  if (value === undefined) return [...COLLAPSIBLE_STAGES]
  return value.split(",").filter((stage): stage is DealStage => (COLLAPSIBLE_STAGES as readonly string[]).includes(stage))
}

export function serializeCollapsedStages(stages: readonly DealStage[]): string {
  return stages.length > 0 ? stages.join(",") : "-"
}
