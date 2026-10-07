import type { KpiDelta } from "@/components/kpi-tile"
import { formatMoney, formatMoneyDelta, formatMoneyShort } from "@/features/finance/money"
import { formatChange, formatNumber } from "@/lib/format"
import type { MetricUnit } from "@/lib/types"

/*
 * Valores dos indicadores na tela: dinheiro em centavos, percentual em pontos.
 */

export function formatMetric(value: number | null, unit: MetricUnit, precise = false): string {
  if (value === null || !Number.isFinite(value)) return "—"
  switch (unit) {
    case "money":
      return precise ? formatMoney(value) : formatMoneyShort(value)
    case "percent":
      return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    case "days":
      return `${formatNumber(value, true)} ${Math.abs(value) === 1 ? "dia" : "dias"}`
    case "count":
      return formatNumber(value)
    default:
      return formatNumber(value, true)
  }
}

/** Variação contra o período de comparação (com a direção boa do indicador). */
export function metricDelta(
  value: number | null,
  previous: number | null,
  unit: MetricUnit,
  better: "up" | "down" | null,
  comparedTo: string
): KpiDelta | null {
  if (value === null || previous === null) return null
  const diff = value - previous
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat"
  const upIsGood = better === "up" ? true : better === "down" ? false : null
  let text: string
  if (unit === "percent") {
    const points = Math.abs(diff).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
    text = diff === 0 ? "0 p.p." : `${diff > 0 ? "+" : "−"}${points} p.p.`
  } else if (unit === "days") {
    const days = formatNumber(Math.abs(diff), true)
    text = diff === 0 ? "0 dias" : `${diff > 0 ? "+" : "−"}${days} ${Math.abs(diff) === 1 ? "dia" : "dias"}`
  } else if (previous === 0) {
    text = unit === "money" ? formatMoneyDelta(diff) : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatNumber(Math.abs(diff), unit === "number")}`
  } else {
    text = formatChange(diff / Math.abs(previous))
  }
  return { text, direction, upIsGood, comparedTo }
}
