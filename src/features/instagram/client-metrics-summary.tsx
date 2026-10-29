"use client"

import { BarChart3 } from "lucide-react"
import { useEffect, useState } from "react"

import type { PostSummary } from "@/features/content/logic"
import { loadClientMetricsSummary } from "@/features/instagram/metrics-actions"
import type { ClientMetricsSummary } from "@/features/instagram/metrics-queries"
import { formatNumber } from "@/lib/format"
import { INSTAGRAM_METRIC_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Cartão Conteúdo do cliente (admin): o Instagram dos últimos 30 dias, pela
 * última leitura de cada post publicado: posts, visualizações, alcance
 * médio, interações e o post com melhor desempenho (abre o post).
 */
export function ClientMetricsSummaryRow({
  clientId,
  posts,
  onOpen,
  className,
}: {
  clientId: string
  posts: PostSummary[]
  onOpen: (post: PostSummary) => void
  className?: string
}) {
  const [summary, setSummary] = useState<ClientMetricsSummary | null>(null)

  useEffect(() => {
    let current = true
    void loadClientMetricsSummary(clientId).then((result) => {
      if (current && result.ok) setSummary(result.data)
    })
    return () => {
      current = false
    }
  }, [clientId])

  if (!summary || summary.posts === 0) return null
  const L = INSTAGRAM_METRIC_LABEL
  const best = summary.best ? posts.find((post) => post.id === summary.best?.postId) : undefined
  const items = [
    { label: summary.posts === 1 ? "post publicado" : "posts publicados", value: formatNumber(summary.posts) },
    { label: L.views.toLocaleLowerCase("pt-BR"), value: formatNumber(summary.views) },
    { label: "alcance médio", value: formatNumber(summary.avgReach) },
    { label: L.interactions.toLocaleLowerCase("pt-BR"), value: formatNumber(summary.interactions) },
  ]

  return (
    <section aria-label="Instagram nos últimos 30 dias" className={cn("space-y-1.5 border-b px-4 py-3 text-xs", className)}>
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
        <BarChart3 className="size-3.5 text-brand-ink" aria-hidden="true" />
        Instagram nos últimos 30 dias
        {summary.measured < summary.posts ? (
          <span className="font-normal">· {summary.measured} com leitura</span>
        ) : null}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <li key={item.label} className="text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{item.value}</span> {item.label}
          </li>
        ))}
      </ul>
      {summary.bestTitle ? (
        <p className="text-muted-foreground">
          Melhor desempenho:{" "}
          {best ? (
            <button type="button" onClick={() => onOpen(best)} className="font-medium text-foreground underline-offset-2 hover:underline">
              {summary.bestTitle}
            </button>
          ) : (
            <span className="font-medium text-foreground">{summary.bestTitle}</span>
          )}
          {summary.best?.views !== null && summary.best?.views !== undefined
            ? ` (${formatNumber(summary.best.views)} ${L.views.toLocaleLowerCase("pt-BR")})`
            : null}
        </p>
      ) : null}
    </section>
  )
}
