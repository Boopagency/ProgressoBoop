/*
 * Escala dos gráficos: domínio com zero e marcas "redondas" (1, 2, 2,5, 5 × 10ⁿ).
 */

export interface Scale {
  min: number
  max: number
  ticks: number[]
  /** Posição vertical (0 = topo, 100 = base) de um valor, em %. */
  y: (value: number) => number
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

/** Escala que cobre os valores (e o zero) com cerca de `count` intervalos. */
export function niceScale(values: number[], count = 4): Scale {
  const finite = values.filter((value) => Number.isFinite(value))
  let low = Math.min(0, ...finite)
  let high = Math.max(0, ...finite)
  if (low === high) high = low + 1
  const step = niceStep(high - low, count)
  low = Math.floor(low / step) * step
  high = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(Math.round(tick * 1e6) / 1e6)
  const span = high - low
  return { min: low, max: high, ticks, y: (value) => ((high - value) / span) * 100 }
}

/** Mostra só um a cada N rótulos do eixo X quando há muitos meses. */
export function labelEvery(count: number): number {
  return count > 18 ? 3 : count > 12 ? 2 : 1
}
