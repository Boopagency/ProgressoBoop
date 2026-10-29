"use client"

import { BarChart3, ExternalLink, Link2, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { PostSummary } from "@/features/content/logic"
import {
  linkInstagramMedia,
  listLinkableMedia,
  loadPostPerformance,
  type LinkableMedia,
  type PostPerformance,
} from "@/features/instagram/metrics-actions"
import { captionStart } from "@/features/instagram/metrics-logic"
import { MetricsEvolution, MetricsGrid, ReadingNote, readingTime } from "@/features/instagram/metrics-view"
import { cn } from "@/lib/utils"

/**
 * "Desempenho" no post publicado (admin): os números da última leitura do
 * Instagram, quando foi lida, a evolução e a próxima leitura, com o link
 * "Ver no Instagram". Post publicado sem a publicação ligada (reels, vídeo
 * ou feito direto no Instagram) mostra "Ligar ao post do Instagram".
 */
export function PerformancePanel({ post, className }: { post: PostSummary; className?: string }) {
  const [data, setData] = useState<PostPerformance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const relevant = post.stage === "published" && post.networks.includes("instagram") && post.format !== "text"

  const reload = useCallback(async () => {
    const result = await loadPostPerformance(post.id)
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else setError(result.error)
  }, [post.id])

  useEffect(() => {
    if (!relevant) return
    let current = true
    void loadPostPerformance(post.id).then((result) => {
      if (!current) return
      if (result.ok) setData(result.data)
      else setError(result.error)
    })
    return () => {
      current = false
    }
  }, [post.id, relevant])

  if (!relevant) return null

  const latest = data?.readings.at(-1) ?? null

  return (
    <section aria-label="Desempenho no Instagram" className={cn("space-y-2.5 rounded-lg border p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <BarChart3 className={cn("size-3.5", latest ? "text-brand-ink" : "text-muted-foreground")} aria-hidden="true" />
          Desempenho
        </p>
        {data?.permalink ? (
          <a
            href={data.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink underline-offset-2 hover:underline"
          >
            Ver no Instagram
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-muted-foreground">{error}</p>
      ) : !data ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : !data.linked ? (
        <LinkMedia postId={post.id} canLink={data.canLink} onLinked={reload} />
      ) : (
        <>
          {latest ? (
            <>
              <MetricsGrid reading={latest} />
              <ReadingNote reading={latest} />
              <MetricsEvolution readings={data.readings} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {data.kind === "story"
                ? "Os números do story são lidos 1 h, 12 h e 23 h depois da publicação, antes de sumirem do Instagram."
                : "Os números são lidos 1 h, 24 h, 3 dias, 7 dias e 30 dias depois da publicação."}
            </p>
          )}
          {data.lastError ? <p className="text-xs text-muted-foreground">Última leitura: {data.lastError}</p> : null}
          <p className="text-xs text-muted-foreground">
            {data.nextAt ? `Próxima leitura: ${readingTime(data.nextAt)}.` : latest ? "Coleta encerrada." : null}
          </p>
        </>
      )}
    </section>
  )
}

/** Escolher a publicação da conta do cliente que é este post. */
function LinkMedia({ postId, canLink, onLinked }: { postId: string; canLink: boolean; onLinked: () => Promise<void> }) {
  const [media, setMedia] = useState<LinkableMedia[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function open() {
    setLoading(true)
    const result = await listLinkableMedia(postId)
    setLoading(false)
    if (result.ok) setMedia(result.data)
    else toast.error(result.error)
  }

  function link(item: LinkableMedia) {
    startTransition(async () => {
      const result = await linkInstagramMedia(postId, item.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Post ligado ao Instagram", { description: "As métricas entram na próxima coleta." })
      await onLinked()
    })
  }

  if (!canLink) {
    return (
      <p className="text-xs text-muted-foreground">
        Este post não está ligado a uma publicação do Instagram. Para ligar e acompanhar os números, conecte o Instagram
        do cliente.
      </p>
    )
  }

  if (!media) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Publicado fora do app (reels, vídeo ou direto no Instagram)? Ligue à publicação para acompanhar os números.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void open()} className="h-7 gap-1 px-2.5 text-xs shadow-none">
          {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
          Ligar ao post do Instagram
        </Button>
      </div>
    )
  }

  if (media.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma publicação recente na conta do cliente.</p>

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Escolha a publicação (as mais recentes da conta; stories não aparecem aqui):</p>
      <ul aria-label="Publicações recentes do Instagram" className="max-h-72 space-y-1 overflow-y-auto">
        {media.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={item.taken || isPending}
              onClick={() => link(item)}
              className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="relative block size-11 shrink-0 overflow-hidden rounded bg-muted">
                {item.thumbnailUrl ? (
                  // Miniatura do CDN da Meta (endereço temporário): sem otimização do Next.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">
                  {item.timestamp ? readingTime(item.timestamp) : "Sem data"}
                  {item.taken ? <span className="font-normal text-muted-foreground"> · já ligada a outro post</span> : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{captionStart(item.caption) || "Sem legenda"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" onClick={() => setMedia(null)} disabled={isPending} className="h-7 px-2 text-xs text-muted-foreground">
        Cancelar
      </Button>
    </div>
  )
}
