import { moneyInputValue, parseMoney } from "@/features/finance/money"
import type { MetricUnit } from "@/lib/types"

/*
 * Valores das metas nos campos de texto: reais ↔ centavos, "25" ↔ 25 pontos
 * percentuais, números com vírgula decimal.
 */

export function valueToInput(value: number | null, unit: MetricUnit): string {
  if (value === null) return ""
  if (unit === "money") return moneyInputValue(value)
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false })
}

/** Texto → valor na unidade (null se inválido; vazio = null). */
export function inputToValue(text: string, unit: MetricUnit): number | null {
  const clean = text.trim()
  if (!clean) return null
  if (unit === "money") {
    if (/^\s*(R\$)?\s*0+([.,]0{1,2})?\s*$/.test(clean)) return 0
    return parseMoney(clean)
  }
  const normalized = clean.replace("%", "").replace(/\./g, "").replace(",", ".").trim()
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}

export const UNIT_SUFFIX: Record<MetricUnit, string> = {
  money: "R$",
  percent: "%",
  count: "",
  number: "",
  days: "dias",
}
