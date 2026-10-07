import { niceScale } from "@/components/charts/scale"
import { cn } from "@/lib/utils"

/**
 * Tendência mínima de um indicador (sem eixos): a linha em cinza e o último
 * ponto no tom da marca. Os valores ficam no texto do indicador.
 */
export function Sparkline({ values, className }: { values: (number | null)[]; className?: string }) {
  const points = values
    .map((value, index) => (value === null ? null : { index, value }))
    .filter((point): point is { index: number; value: number } => point !== null)
  if (points.length < 2) return null
  const scale = niceScale(
    points.map((point) => point.value),
    2
  )
  // A escala inclui o zero: uma variação pequena não parece enorme.
  const x = (index: number) => (values.length === 1 ? 50 : (index / (values.length - 1)) * 100)
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.index).toFixed(2)},${scale.y(point.value).toFixed(2)}`).join(" ")
  const last = points[points.length - 1]!
  return (
    <span aria-hidden="true" className={cn("relative block h-8 w-full", className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-chart-muted" />
      </svg>
      <span
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-card"
        style={{ left: `${x(last.index)}%`, top: `${scale.y(last.value)}%` }}
      />
    </span>
  )
}
