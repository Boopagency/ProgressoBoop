import { Eye } from "lucide-react"

import { MetricsEvolution, ReadingNote } from "@/features/instagram/metrics-view"
import { formatWatchTime, interactionsOf, type MetricReading } from "@/features/instagram/metrics-logic"
import { formatNumber } from "@/lib/format"
import { INSTAGRAM_METRIC_LABEL } from "@/lib/labels"

type Tile = { label: string; value: string }

/** Os números de uma leitura além das visualizações (os que valem para o tipo e que a Meta deu). */
function tilesOf(reading: MetricReading): Tile[] {
  const tile = (label: string, value: number | null): Tile[] => (value === null ? [] : [{ label, value: formatNumber(value) }])
  const L = INSTAGRAM_METRIC_LABEL
  return [
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

/**
 * "Desempenho no Instagram" do post publicado, no portal: as visualizações
 * em número grande, os outros números em grade, quando foi lido e a evolução
 * pelas leituras. Os mesmos números do admin, sem nada interno.
 */
export function PortalMetrics({ readings }: { readings: MetricReading[] }) {
  const latest = readings.at(-1)
  if (!latest) return null
  const tiles = tilesOf(latest)
  return (
    <section aria-labelledby="desempenho" className="rounded-[1.75rem] border bg-card p-5 sm:p-6">
      <div>
        <h2 id="desempenho" className="eyebrow text-muted-foreground">
          Desempenho no Instagram
        </h2>
        {latest.views !== null ? (
          <p className="mt-3 flex items-baseline gap-3">
            <span className="display-number text-[64px] leading-[0.85] text-foreground">{formatNumber(latest.views)}</span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Eye className="size-4" aria-hidden="true" />
              {INSTAGRAM_METRIC_LABEL.views.toLocaleLowerCase("pt-BR")}
            </span>
          </p>
        ) : null}
      </div>

      {tiles.length === 0 && latest.views === null ? (
        <p className="mt-3 text-[13px] text-muted-foreground">O Instagram ainda não deu números para esse post.</p>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="border-t border-foreground/12 pt-2.5">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className="mt-1 display-number text-[30px] leading-none text-foreground">{tile.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <ReadingNote reading={latest} className="mt-5" />
      <MetricsEvolution readings={readings} className="mt-4 rounded-xl border px-3 py-2" />
    </section>
  )
}
