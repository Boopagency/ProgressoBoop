import { Grid3x3, ImagePlus, Pin } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { PageBody, PageContainer } from "@/components/layout/page"
import { EmptyPanel } from "@/components/empty-panel"
import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import { formatCompact } from "@/features/instagram/metrics-logic"
import { TileViews } from "@/features/instagram/metrics-view"
import { PORTAL_STATUS_LABEL, portalFeed, portalStatus, postThumbnail, type PortalPost } from "@/features/portal/content-logic"
import { StatusDot } from "@/features/portal/post-meta"
import { PortalImage } from "@/features/portal/portal-image"
import { PortalHeader } from "@/features/portal/portal-ui"
import type { DateKey } from "@/lib/types"
import { CONTENT_FORMAT_LABEL, INSTAGRAM_METRIC_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

export interface PortalFeedData {
  clientName: string
  handle: string | null
  bio: string | null
  /** A foto do perfil (ProfilePhoto), montada pela página. */
  photo: ReactNode
  /** O cartão Instagram (conectar a conta), montado pela página. */
  instagram: ReactNode
  posts: PortalPost[]
  /** Visualizações da última leitura dos publicados, por post. */
  views: Record<string, number>
  today: DateKey
  postHref: (id: string) => string
}

/**
 * Feed do portal: a prévia do Instagram do cliente (foto, @, número de posts,
 * bio e o grid na mesma ordem, fixados primeiro) com os posts que já chegaram
 * a ele. No computador, o feed fica numa moldura de celular e o cartão
 * Instagram e a legenda dos pontos ficam ao lado; no celular, o cartão vem
 * primeiro. Nos publicados, as visualizações ao passar o mouse.
 */
export function PortalFeedView({ clientName, handle, bio, photo, instagram, posts, views, today, postHref }: PortalFeedData) {
  const tiles = portalFeed(posts)
  const published = tiles.filter((post) => post.stage === "published").length
  const toReview = tiles.filter((post) => portalStatus(post.stage) === "review").length
  const totalViews = tiles.reduce((total, post) => total + (views[post.id] ?? 0), 0)

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Prévia do <em>feed</em>
          </>
        }
        description="Como o perfil vai ficar com os posts que você já viu. Stories não entram no feed."
        stats={[
          { label: "Para aprovar", value: toReview },
          ...(totalViews > 0 ? [{ label: INSTAGRAM_METRIC_LABEL.views, value: formatCompact(totalViews) }] : []),
        ]}
      />

      <PageBody>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start xl:gap-12">
          {/* No computador, o cartão Instagram e a legenda vão para a direita; no celular, o cartão vem antes do feed. */}
          <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:order-2 lg:max-w-md">
            {instagram}
            <section aria-labelledby="feed-legenda" className="hidden rounded-2xl border bg-card p-5 lg:block">
              <h2 id="feed-legenda" className="eyebrow text-muted-foreground">
                Como ler o feed
              </h2>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-5 text-foreground">
                <li className="flex items-center gap-3">
                  <TileLegend>
                    <StatusDot stage="client_review" />
                  </TileLegend>
                  <span>
                    Ainda não publicado: o ponto mostra a situação
                    {toReview > 0 ? <span className="text-muted-foreground"> ({toReview} para aprovar)</span> : null}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <TileLegend>
                    <Pin className="size-3.5 fill-current" />
                  </TileLegend>
                  Fixado no topo do perfil
                </li>
                <li className="flex items-center gap-3">
                  <TileLegend>
                    <FormatIcon format="carousel" className="size-3.5" />
                  </TileLegend>
                  Carrossel, reels ou vídeo
                </li>
              </ul>
              <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">
                Nos publicados, passe o mouse para ver as visualizações. Toque num post para abrir, aprovar ou conversar.
              </p>
            </section>
          </div>

          {/* A moldura do perfil, como no aplicativo. */}
          <section
            aria-label="Prévia do perfil"
            className="min-w-0 overflow-hidden rounded-[2rem] border bg-card max-sm:-mx-1 lg:order-1"
          >
            <div className="px-5 pt-6 pb-4 sm:px-6">
              <div className="flex items-center gap-5 sm:gap-7">
                <span className="rounded-full bg-[image:var(--gradient-brand)] p-[3px] shadow-[0_0_28px_-6px_var(--glow)]">
                  <span className="block rounded-full bg-background p-[3px]">{photo}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{handle ? `@${handle}` : clientName}</p>
                  <dl className="mt-2 flex gap-6">
                    <div>
                      <dd className="display-number text-[30px] leading-none text-foreground">{tiles.length}</dd>
                      <dt className="mt-1 text-xs text-muted-foreground">{tiles.length === 1 ? "post" : "posts"}</dt>
                    </div>
                    <div>
                      <dd className="display-number text-[30px] leading-none text-foreground">{published}</dd>
                      <dt className="mt-1 text-xs text-muted-foreground">{published === 1 ? "publicado" : "publicados"}</dt>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="mt-4 text-sm">
                <p className="font-semibold text-foreground">{clientName}</p>
                {bio ? <p className="mt-0.5 break-words whitespace-pre-line text-foreground">{bio}</p> : null}
              </div>
            </div>

            <div className="flex justify-center border-t">
              <span className="-mt-px flex items-center gap-1.5 border-t-2 border-glow px-4 py-2.5 eyebrow text-[10.5px] text-foreground">
                <Grid3x3 className="size-3.5" aria-hidden="true" />
                Posts
              </span>
            </div>

            {tiles.length === 0 ? (
              <EmptyPanel icon={ImagePlus} title="Nenhum post do Instagram ainda" compact framed={false} className="pb-12">
                Quando a equipe enviar o primeiro post para você, ele aparece aqui, no lugar em que vai ficar no perfil.
              </EmptyPanel>
            ) : (
              <ul aria-label="Grid do feed" className="grid grid-cols-3 gap-0.5">
                {tiles.map((post) => {
                  const path = postThumbnail(post)
                  const postViews = views[post.id] ?? null
                  const label = [
                    post.title,
                    CONTENT_FORMAT_LABEL[post.format],
                    publishLabel(post, today),
                    PORTAL_STATUS_LABEL[portalStatus(post.stage)],
                    post.pinned ? "Fixado" : null,
                    postViews !== null ? `${formatCompact(postViews)} ${INSTAGRAM_METRIC_LABEL.views.toLocaleLowerCase("pt-BR")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                  const title = (
                    <span className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,var(--glow-soft),transparent_70%)] p-2 text-center sm:p-3">
                      <span className="line-clamp-5 text-[11px] leading-snug font-medium break-words text-muted-foreground sm:text-xs">
                        {post.title}
                      </span>
                    </span>
                  )
                  return (
                    <li key={post.id} className="group relative">
                      <Link
                        href={postHref(post.id)}
                        aria-label={label}
                        title={label}
                        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring"
                      >
                        {path ? <PortalImage path={path} fallback={title} /> : title}
                        {post.stage !== "published" ? (
                          <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgb(0_0_0/0.35),transparent_40%)]" />
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-1.5 right-1.5 flex items-center gap-1",
                            path ? "text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.55)]" : "text-muted-foreground"
                          )}
                        >
                          {post.pinned ? <Pin className="size-3.5 fill-current sm:size-4" /> : null}
                          {post.format !== "static" && post.format !== "photo" ? (
                            <FormatIcon format={post.format} className="size-3.5 sm:size-4" />
                          ) : null}
                        </span>
                        {post.stage !== "published" ? (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-1.5 left-1.5 flex h-5 items-center gap-1 rounded-full bg-background/90 px-1.5 text-[10.5px] font-medium text-foreground shadow-sm"
                          >
                            <StatusDot stage={post.stage} />
                            <span className="max-sm:hidden">{PORTAL_STATUS_LABEL[portalStatus(post.stage)]}</span>
                          </span>
                        ) : null}
                        {postViews !== null ? <TileViews views={postViews} /> : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </PageContainer>
  )
}

/** Um quadradinho da legenda, como o canto de um post do grid. */
function TileLegend({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground"
    >
      {children}
    </span>
  )
}
