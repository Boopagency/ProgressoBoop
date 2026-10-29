import { Eye } from "lucide-react"

import { formatCompact, formatWatchTime, interactionsOf, type MetricReading } from "@/features/instagram/metrics-logic"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import { formatNumber } from "@/lib/format"
import { INSTAGRAM_METRIC_LABEL, METRICS_CHECKPOINT_LABEL } from "@/lib/labels"
import type { Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Números das métricas de um post (admin e portal): a última leitura e a
 * evolução pelos momentos. Sem estado, para servir em componente de servidor
 * e de cliente.
 */

/** "29/10 às 14:05". */
export function readingTime(instant: Timestamp): string {
  return `${formatShortDate(toDateKey(instant))} às ${toTimeLabel(instant)}`
}

type Tile = { label: string; value: string }

/** Os números de uma leitura, os que valem para o tipo (e que a Meta deu). */
function tilesOf(reading: MetricReading): Tile[] {
  const tile = (label: string, value: number | null): Tile[] => (value === null ? [] : [{ label, value: formatNumber(value) }])
  const L = INSTAGRAM_METRIC_LABEL
  return [
    ...tile(L.views, reading.views),
    ...tile(L.reach, reading.reach),
    ...tile(L.interactions, interactionsOf(reading)),
    ...tile(L.likes, reading.likes),
    ...tile(L.comments, reading.comments),
    ...tile(L.saved, reading.saved),
    ...tile(L.shares, reading.shares),
    ...(reading.media_kind === "story" ? [...tile(L.replies, reading.replies), ...tile(L.navigation, reading.navigation)] : []),
    ...tile(L.follows, reading.follows),
    ...tile(L.profile_visits, reading.profile_visits),
    ...(reading.avg_watch_time_ms === null ? [] : [{ label: L.avg_watch_time_ms, value: formatWatchTime(reading.avg_watch_time_ms) }]),
  ]
}

export function MetricsGrid({ reading, className }: { reading: MetricReading; className?: string }) {
  const tiles = tilesOf(reading)
  if (tiles.length === 0) return <p className={cn("text-xs text-muted-foreground", className)}>O Instagram ainda não deu números para esse post.</p>
  return (
    <dl className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>
      {tiles.map((tile, index) => (
        <div key={tile.label} className="rounded-md bg-muted/50 px-2.5 py-2">
          <dt className="text-[11px] text-muted-foreground">{tile.label}</dt>
          <dd className={cn("text-sm font-semibold text-foreground tabular-nums", index === 0 && "text-brand-ink")}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A evolução pelos momentos lidos (+1 h → +30 dias): visualizações, alcance e interações. */
export function MetricsEvolution({ readings, className }: { readings: MetricReading[]; className?: string }) {
  if (readings.length < 2) return null
  const L = INSTAGRAM_METRIC_LABEL
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-xs tabular-nums">
        <caption className="sr-only">Evolução das métricas</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-medium">Leitura</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">{L.views}</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">{L.reach}</th>
            <th scope="col" className="py-1 text-right font-medium">{L.interactions}</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => (
            <tr key={reading.checkpoint} className="border-t">
              <th scope="row" className="py-1 pr-3 text-left font-normal text-muted-foreground">
                {METRICS_CHECKPOINT_LABEL[reading.checkpoint] ?? reading.checkpoint}
              </th>
              <td className="py-1 pr-3 text-right text-foreground">{formatNumber(reading.views)}</td>
              <td className="py-1 pr-3 text-right text-foreground">{formatNumber(reading.reach)}</td>
              <td className="py-1 text-right text-foreground">{formatNumber(interactionsOf(reading))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Lido em 29/10 às 14:05 (+24 h)." */
export function ReadingNote({ reading, className }: { reading: MetricReading; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Lido em {readingTime(reading.collected_at)} ({METRICS_CHECKPOINT_LABEL[reading.checkpoint] ?? reading.checkpoint} da publicação).
    </p>
  )
}

/** Visualizações no canto, ao passar o mouse (como no Instagram, no perfil). */
export function TileViews({ views }: { views: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-1.5 bottom-1.5 hidden items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-fine:flex"
    >
      <Eye className="size-3" />
      {formatCompact(views)}
    </span>
  )
}
