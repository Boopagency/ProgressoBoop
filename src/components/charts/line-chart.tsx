"use client"

import { useState } from "react"

import { ChartTooltip, type TooltipLine } from "@/components/charts/chart-tooltip"
import { labelEvery, niceScale } from "@/components/charts/scale"
import { cn } from "@/lib/utils"

export interface LineSeries {
  key: string
  label: string
  values: (number | null)[]
  tone: "primary" | "secondary" | "muted"
}

const STROKE: Record<LineSeries["tone"], string> = {
  primary: "stroke-chart-1",
  secondary: "stroke-chart-2",
  muted: "stroke-chart-muted",
}
const DOT: Record<LineSeries["tone"], string> = {
  primary: "bg-chart-1",
  secondary: "bg-chart-2",
  muted: "bg-chart-muted",
}

/** Caminho SVG (coordenadas de 0 a 100) ligando os pontos com valor. */
function pathOf(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ")
}

/**
 * Linhas no tempo, um eixo só. O trecho previsto (a partir de `forecastFrom`)
 * fica no tom claro. Linha de referência opcional (ex.: caixa mínimo). A
 * linha vertical acompanha o mouse (ou as setas) e o detalhe lista as séries.
 */
export function LineChart({
  labels,
  series,
  format,
  axisFormat,
  height = 180,
  forecastFrom,
  reference,
  area = false,
  ariaLabel,
  className,
}: {
  /** Um rótulo por posição: curto (eixo) e completo (detalhe). */
  labels: { label: string; title: string; current?: boolean }[]
  series: LineSeries[]
  format: (value: number) => string
  axisFormat: (value: number) => string
  height?: number
  /** Primeira posição prevista (o trecho daí em diante fica claro). */
  forecastFrom?: number
  reference?: { value: number; label: string }
  /** Véu suave sob a linha (só com uma série). */
  area?: boolean
  ariaLabel: string
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const count = labels.length
  const scale = niceScale(
    [...series.flatMap((line) => line.values.filter((value): value is number => value !== null)), ...(reference ? [reference.value] : [])],
    4
  )
  const x = (index: number) => ((index + 0.5) / count) * 100
  const every = labelEvery(count)

  function tooltipLines(index: number): TooltipLine[] {
    return series
      .filter((line) => line.values[index] !== null && line.values[index] !== undefined)
      .map((line) => ({
        label: series.length > 1 ? line.label : forecastFrom !== undefined && index >= forecastFrom ? `${line.label} (previsto)` : line.label,
        value: format(line.values[index]!),
        tone: forecastFrom !== undefined && index >= forecastFrom && line.tone === "primary" ? ("light" as const) : line.tone,
      }))
  }

  return (
    <figure className={cn("relative", className)}>
      {series.length > 1 ? (
        <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((line) => (
            <span key={line.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("h-0.5 w-3 rounded-full", DOT[line.tone])} />
              {line.label}
            </span>
          ))}
        </figcaption>
      ) : null}
      <div
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel}. Use as setas para ver cada mês.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault()
            const step = event.key === "ArrowRight" ? 1 : -1
            setActive((index) => Math.min(count - 1, Math.max(0, (index ?? (step > 0 ? -1 : count)) + step)))
          } else if (event.key === "Escape") {
            setActive(null)
          }
        }}
        onBlur={() => setActive(null)}
        className="flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <div aria-hidden="true" className="relative w-14 shrink-0" style={{ height }}>
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
              style={{ top: `${scale.y(tick)}%` }}
            >
              {axisFormat(tick)}
            </span>
          ))}
        </div>
        <div
          className="relative min-w-0 flex-1"
          style={{ height }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const index = Math.floor(((event.clientX - rect.left) / rect.width) * count)
            setActive(Math.min(count - 1, Math.max(0, index)))
          }}
          onPointerLeave={() => setActive(null)}
        >
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className={cn("absolute inset-x-0 h-px", tick === 0 ? "bg-border" : "bg-chart-grid")}
              style={{ top: `${scale.y(tick)}%` }}
            />
          ))}
          {reference ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
              style={{ top: `${scale.y(reference.value)}%` }}
            >
              <span className="absolute -top-4 left-0 rounded bg-card/90 px-1 text-[11px] whitespace-nowrap text-muted-foreground">
                {reference.label}
              </span>
            </span>
          ) : null}
          {active !== null ? (
            <span aria-hidden="true" className="absolute inset-y-0 w-px bg-muted-foreground/40" style={{ left: `${x(active)}%` }} />
          ) : null}
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {series.map((line) => {
              const points = line.values
                .map((value, index) => (value === null ? null : { index, x: x(index), y: scale.y(value) }))
                .filter((point): point is { index: number; x: number; y: number } => point !== null)
              const split = forecastFrom === undefined ? points.length : points.findIndex((point) => point.index >= forecastFrom)
              const solid = split === -1 ? points : points.slice(0, split)
              // O trecho previsto começa no último ponto realizado, para a linha não ter falha.
              const projected = split === -1 || split === points.length ? [] : points.slice(Math.max(0, split - 1))
              return (
                <g key={line.key}>
                  {area && series.length === 1 && points.length > 1 ? (
                    <path
                      d={`${pathOf(points)} L${points[points.length - 1]!.x},${scale.y(0)} L${points[0]!.x},${scale.y(0)} Z`}
                      className="fill-chart-1 opacity-10"
                    />
                  ) : null}
                  {solid.length > 1 ? (
                    <path d={pathOf(solid)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={STROKE[line.tone]} />
                  ) : null}
                  {projected.length > 1 ? (
                    <path
                      d={pathOf(projected)}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={line.tone === "primary" ? "stroke-chart-1-light" : STROKE[line.tone]}
                    />
                  ) : null}
                </g>
              )
            })}
          </svg>
          {series.map((line) => {
            const last = line.values.findLastIndex((value) => value !== null)
            const marks = new Set<number>(last >= 0 ? [last] : [])
            if (active !== null && line.values[active] !== null && line.values[active] !== undefined) marks.add(active)
            return [...marks].map((index) => (
              <span
                key={`${line.key}-${index}`}
                aria-hidden="true"
                className={cn(
                  "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                  forecastFrom !== undefined && index >= forecastFrom && line.tone === "primary" ? "bg-chart-1-light" : DOT[line.tone]
                )}
                style={{ left: `${x(index)}%`, top: `${scale.y(line.values[index]!)}%` }}
              />
            ))
          })}
          {active !== null ? (
            <ChartTooltip index={active} count={count} title={labels[active]!.title} lines={tooltipLines(active)} />
          ) : null}
        </div>
      </div>
      <div aria-hidden="true" className="ml-14 flex pt-1.5">
        {labels.map((label, index) => (
          <span
            key={`${label.title}-${index}`}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground",
              label.current && "font-medium text-foreground",
              index % every !== 0 && !label.current && "invisible"
            )}
          >
            {label.label}
          </span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {active !== null
          ? `${labels[active]!.title}: ${tooltipLines(active).map((line) => `${line.label} ${line.value}`).join(", ")}`
          : ""}
      </p>
    </figure>
  )
}
