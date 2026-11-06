import { CalendarClock, Globe, PencilLine } from "lucide-react"
import type { ReactNode } from "react"

import { PageBody, PageContainer } from "@/components/layout/page"
import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import { InstagramCaption, InstagramHeader } from "@/features/content/instagram-post"
import type { MetricReading } from "@/features/instagram/metrics-logic"
import { canReview, portalStatus, postGallery, type PortalPost } from "@/features/portal/content-logic"
import type { PortalMessage } from "@/features/portal/content-queries"
import { PostChat } from "@/features/portal/post-chat"
import { StatusBadge } from "@/features/portal/post-meta"
import { PortalGallery } from "@/features/portal/portal-gallery"
import { PortalMetrics } from "@/features/portal/portal-metrics"
import { PortalHeader } from "@/features/portal/portal-ui"
import { ReviewPanel } from "@/features/portal/review-panel"
import { CONTENT_FORMAT_LABEL, CONTENT_NETWORK_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"

export interface PortalPostData {
  post: PortalPost
  clientName: string
  /** Mostra o cliente na linha de cima (para quem acompanha mais de um). */
  showClient: boolean
  handle: string | null
  /** A foto pequena do perfil (ProfilePhoto), montada pela página. */
  avatar: ReactNode
  messages: PortalMessage[]
  /** Leituras das métricas do Instagram (só do publicado). */
  readings: MetricReading[]
  today: DateKey
  /** A conversa busca mensagens novas sozinha (desligado na vitrine). */
  live?: boolean
}

/** Etiqueta da linha de cima do post: ícone e texto em pílula de contorno fino. */
function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-foreground/15 px-2.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * Post aberto no portal: em cima, a situação, o formato, as redes e a data;
 * a resposta do cliente (Aprovar e Pedir ajuste) no painel de destaque; as
 * imagens uma de cada vez, a legenda, o texto dos slides e os números do
 * Instagram (publicado) à esquerda; a conversa com a equipe ao lado.
 */
export function PortalPostView({ post, clientName, showClient, handle, avatar, messages, readings, today, live = true }: PortalPostData) {
  const status = portalStatus(post.stage)
  const gallery = postGallery(post)
  const slideTexts = post.slides.filter((slide) => slide.text.trim())
  const reviewing = canReview(post)

  return (
    <PageContainer>
      <PortalHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge stage={post.stage} />
            <MetaPill>
              <FormatIcon format={post.format} />
              {CONTENT_FORMAT_LABEL[post.format]}
            </MetaPill>
            <MetaPill>
              <Globe className="size-3.5" aria-hidden="true" />
              {post.networks.map((network) => CONTENT_NETWORK_LABEL[network]).join(", ")}
            </MetaPill>
            <MetaPill>
              <CalendarClock className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{publishLabel(post, today)}</span>
            </MetaPill>
            {showClient ? <MetaPill>{clientName}</MetaPill> : null}
          </div>
        }
        title={post.title}
      />

      <PageBody>
        {reviewing ? (
          <ReviewPanel postId={post.id} />
        ) : status === "adjusting" ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl border bg-card px-5 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PencilLine className="size-4" aria-hidden="true" />
            </span>
            <p className="text-[13.5px] leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">A equipe está fazendo os ajustes que você pediu.</span> Quando
              o post voltar para você, ele aparece em “Para aprovar” e você responde de novo. Enquanto isso, pode conversar
              pelo chat.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            {/* No celular, como no Instagram: a foto e o @, o carrossel e a legenda com "mais". */}
            <div className="space-y-3">
              <InstagramHeader className="px-1 md:hidden" avatar={avatar} handle={handle} name={clientName} />
              <PortalGallery paths={gallery} title={post.title} />
              {post.caption ? (
                <InstagramCaption className="px-1 md:hidden" handle={handle} name={clientName} text={post.caption} />
              ) : null}
            </div>

            <PortalMetrics readings={readings} />

            {post.caption ? (
              <section aria-labelledby="legenda" className="hidden rounded-[1.75rem] border bg-card p-5 sm:p-6 md:block">
                <div className="flex items-center gap-2.5">
                  {avatar}
                  <h2 id="legenda" className="eyebrow text-muted-foreground">
                    Legenda
                  </h2>
                </div>
                <p className="mt-4 text-[15px] leading-6 break-words whitespace-pre-line text-foreground">{post.caption}</p>
              </section>
            ) : null}

            {slideTexts.length > 0 ? (
              <section aria-labelledby="texto-slides" className="rounded-[1.75rem] border bg-card p-5 sm:p-6">
                <h2 id="texto-slides" className="eyebrow text-muted-foreground">
                  Texto dos slides
                </h2>
                <ol className="mt-4 space-y-3">
                  {post.slides.map((slide, index) =>
                    slide.text.trim() ? (
                      <li key={index} className="flex gap-4 text-[15px] leading-6 text-foreground">
                        <span className="w-6 shrink-0 text-right display-number text-[22px] leading-6 text-brand-ink">{index + 1}</span>
                        <span className="min-w-0 break-words whitespace-pre-line">{slide.text}</span>
                      </li>
                    ) : null
                  )}
                </ol>
              </section>
            ) : null}
          </div>

          {/* A conversa acompanha a rolagem no computador. Recomeça com as mensagens do servidor quando a página volta com novidade. */}
          <div className="min-w-0 md:sticky md:top-6 md:self-start">
            <PostChat
              key={`${messages.length}-${messages.at(-1)?.id ?? ""}`}
              target={{ kind: "post", id: post.id }}
              initialMessages={messages}
              live={live}
              className="md:h-[min(680px,calc(100svh-7rem))]"
            />
          </div>
        </div>
        {/* Espaço para a barra fixa de Aprovar e Pedir ajuste no celular. */}
        {reviewing ? <div aria-hidden="true" className="h-20 md:hidden" /> : null}
      </PageBody>
    </PageContainer>
  )
}
