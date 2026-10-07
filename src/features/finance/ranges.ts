import { addPeriods } from "@/features/clients/logic"
import { periodsFrom } from "@/features/finance/management"
import type { DateKey } from "@/lib/types"

/*
 * Janelas de meses das telas do financeiro (DRE, exportação).
 */

/** Janela padrão do DRE: 12 meses com o atual no meio (nunca antes do início do controle). */
export function defaultDreStart(openingOn: DateKey, current: DateKey): DateKey {
  const start = addPeriods(current, -5)
  return start > openingOn ? start : openingOn
}

export interface DreRange {
  key: string
  periods: DateKey[]
}

/** `?ano=2027` → janeiro a dezembro; sem ano → a janela padrão de 12 meses. */
export function resolveDreRange(year: unknown, openingOn: DateKey, current: DateKey): DreRange {
  if (typeof year === "string" && /^\d{4}$/.test(year)) {
    const value = Number(year)
    if (value >= 2000 && value <= 2100) return { key: year, periods: periodsFrom(`${year}-01-01`, 12) }
  }
  return { key: "12m", periods: periodsFrom(defaultDreStart(openingOn, current), 12) }
}

/** Opções do seletor: a janela de 12 meses e os anos do início do controle até o próximo. */
export function dreRangeOptions(openingOn: DateKey, current: DateKey, basePath: string): { key: string; label: string; href: string }[] {
  const first = Number(openingOn.slice(0, 4))
  const last = Number(current.slice(0, 4)) + 1
  const years: { key: string; label: string; href: string }[] = []
  for (let year = first; year <= last; year += 1) years.push({ key: String(year), label: String(year), href: `${basePath}?ano=${year}` })
  return [{ key: "12m", label: "12 meses", href: basePath }, ...years]
}
