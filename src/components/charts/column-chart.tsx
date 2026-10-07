"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { ChartTooltip, type TooltipLine } from "@/components/charts/chart-tooltip"
import { labelEvery, niceScale } from "@/components/charts/scale"
import { cn } from "@/lib/utils"

export interface ColumnDatum {
  key: string
  /** Rótulo curto do eixo X ("out"). */
  label: string
  /** Título no detalhe ("Outubro de 2026"). */
  title: string
  /** Valor realizado (ou o único valor). Negativo desce do zero. */
  value: number
  /** Parte prevista, empilhada acima do realizado (mais clara). */
  forecast?: number
  /** O valor inteiro é previsão (coluna no tom claro, inclusive se negativo). */
  projected?: boolean
  /** Linhas extras no detalhe. */
  details?: TooltipLine[]
  /** Mês atual (rótulo em destaque). */
  current?: boolean
  /** Para onde ir ao clicar (os dados que formam a coluna). */
  href?: string
}

/**
 * Colunas com eixo único: realizado (cheio) e previsto (mais claro, empilhado),
 * valores negativos abaixo do zero, linha de referência opcional. Passar o
 * mouse (ou as setas do teclado) mostra o detalhe; clicar abre a origem.
 */
export function ColumnChart({
  data,
  format,
  axisFormat,
  height = 180,
  reference,
  legend,
  ariaLabel,
  className,
}: {
  data: ColumnDatum[]
  format: (value: number) => string
  axisFormat: (value: number) => string
  height?: number
  reference?: { value: number; label: string }
  /** Rótulos da legenda (só quando há previsto). */
  legend?: { realized: string; forecast: string }
  ariaLabel: string
  className?: string
}) {
  const router = useRouter()
  const [active, setActive] = useState<number | null>(null)
  const scale = niceScale(
    [...data.flatMap((datum) => [datum.value, datum.value + (datum.forecast ?? 0)]), ...(reference ? [reference.value] : [])],
    4
  )
  const zero = scale.y(0)
  const every = labelEvery(data.length)
  const current = active === null ? null : data[active]

  function open(index: number | null) {
    const href = index === null ? undefined : data[index]?.href
    if (href) router.push(href)
  }

  function lines(datum: ColumnDatum): TooltipLine[] {
    const forecast = datum.forecast ?? 0
    const out: TooltipLine[] =
      forecast > 0
        ? [
            ...(datum.value !== 0 ? [{ label: legend?.realized ?? "Realizado", value: format(datum.value), tone: "primary" as const }] : []),
            { label: legend?.forecast ?? "Previsto", value: format(forecast), tone: "light" as const },
            ...(datum.value !== 0 ? [{ label: "Total", value: format(datum.value + forecast) }] : []),
          ]
        : [
            {
              label: datum.projected ? (legend?.forecast ?? "Previsto") : (legend?.realized ?? "Valor"),
              value: format(datum.value),
              tone: datum.value < 0 ? ("negative" as const) : datum.projected ? ("light" as const) : ("primary" as const),
            },
          ]
    return [...out, ...(datum.details ?? [])]
  }

  return (
    <figure className={cn("relative", className)}>
      {legend && data.some((datum) => (datum.forecast ?? 0) > 0 || datum.projected) ? (
        <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-chart-1" />
            {legend.realized}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-chart-1-light" />
            {legend.forecast}
          </span>
        </figcaption>
      ) : null}
      <div
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel}. Use as setas para ver cada coluna.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault()
            const step = event.key === "ArrowRight" ? 1 : -1
            setActive((index) => Math.min(data.length - 1, Math.max(0, (index ?? (step > 0 ? -1 : data.length)) + step)))
          } else if (event.key === "Enter") {
            open(active)
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
        <div className="relative min-w-0 flex-1" style={{ height }}>
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
              <span className="absolute -top-4 right-0 rounded bg-card/90 px-1 text-[11px] whitespace-nowrap text-muted-foreground">
                {reference.label}
              </span>
            </span>
          ) : null}
          <div className="absolute inset-0 flex">
            {data.map((datum, index) => {
              const forecast = Math.max(0, datum.forecast ?? 0)
              const negative = datum.value < 0
              const top = scale.y(Math.max(0, datum.value))
              const stackTop = scale.y(Math.max(0, datum.value) + forecast)
              return (
                <div
                  key={datum.key}
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive((value) => (value === index ? null : value))}
                  onClick={() => open(index)}
                  className={cn("relative h-full flex-1", datum.href && "cursor-pointer")}
                >
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-x-0.5 inset-y-0 rounded-md bg-muted/70 opacity-0 transition-opacity", active === index && "opacity-100")}
                  />
                  {negative ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-1/2 w-[min(24px,60%)] -translate-x-1/2 rounded-b-[4px]",
                        datum.projected ? "bg-overdue/45" : "bg-overdue"
                      )}
                      style={{ top: `${zero}%`, height: `${scale.y(datum.value) - zero}%` }}
                    />
                  ) : datum.value > 0 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-1/2 w-[min(24px,60%)] -translate-x-1/2",
                        datum.projected ? "bg-chart-1-light" : "bg-chart-1",
                        forecast === 0 && "rounded-t-[4px]"
                      )}
                      style={{ top: `${top}%`, height: `${zero - top}%` }}
                    />
                  ) : null}
                  {forecast > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 w-[min(24px,60%)] -translate-x-1/2 rounded-t-[4px] bg-chart-1-light"
                      style={{
                        top: `${stackTop}%`,
                        height: datum.value > 0 ? `calc(${top - stackTop}% - 2px)` : `${top - stackTop}%`,
                      }}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
          {current && active !== null ? (
            <ChartTooltip index={active} count={data.length} title={current.title} lines={lines(current)} hint={current.href ? "Clique para ver os lançamentos" : undefined} />
          ) : null}
        </div>
      </div>
      <div aria-hidden="true" className="ml-14 flex pt-1.5">
        {data.map((datum, index) => (
          <span
            key={datum.key}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground",
              datum.current && "font-medium text-foreground",
              index % every !== 0 && !datum.current && "invisible"
            )}
          >
            {datum.label}
          </span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {current ? `${current.title}: ${lines(current).map((line) => `${line.label} ${line.value}`).join(", ")}` : ""}
      </p>
    </figure>
  )
}
