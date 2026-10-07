/*
 * Números em pt-BR fora de dinheiro (dinheiro: features/finance/money.ts).
 */

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })
const percentRound = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 })
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

/** 0.1234 → "12,3%"; null → "—". */
export function formatPercent(fraction: number | null, round = false): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—"
  return (round ? percentRound : percent).format(fraction).replace(/ /g, " ")
}

/** Diferença em pontos percentuais: 0.031 → "+3,1 p.p.". */
export function formatPoints(fraction: number): string {
  const points = decimal.format(Math.abs(fraction * 100))
  if (fraction === 0) return "0 p.p."
  return `${fraction > 0 ? "+" : "−"}${points} p.p.`
}

/** 1234 → "1.234"; 2.5 → "2,5". */
export function formatNumber(value: number | null, decimals = false): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return (decimals ? decimal : integer).format(value)
}

/** Variação relativa com sinal: 0.12 → "+12%". */
export function formatChange(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—"
  const text = percentRound.format(Math.abs(fraction)).replace(/ /g, " ")
  if (Math.round(fraction * 100) === 0) return "0%"
  return `${fraction > 0 ? "+" : "−"}${text}`
}
