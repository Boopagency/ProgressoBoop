import { ChevronLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import { canReview, portalStatus, postGallery, type PortalPost } from "@/features/portal/content-logic"
import { getPortalPostMessages, getPortalPosts } from "@/features/portal/content-queries"
import { PostChat } from "@/features/portal/post-chat"
import { PostGallery } from "@/features/portal/post-gallery"
import { StatusBadge } from "@/features/portal/post-meta"
import { portalHref } from "@/features/portal/portal-nav"
import { ReviewPanel } from "@/features/portal/review-panel"
import { pickPortalClient, requirePortalUser, type PortalClient } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_NETWORK_LABEL } from "@/lib/labels"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Post" }

/** Post aberto no portal: as imagens, a legenda, a resposta do cliente e o chat com a equipe. */
export default async function PortalPostPage(props: PageProps<"/portal/posts/[id]">) {
  const [user, params, searchParams] = await Promise.all([requirePortalUser(), props.params, props.searchParams])
  if (!isUuid(params.id)) notFound()

  // O post costuma ser do cliente escolhido; se não for, procura nos outros da conta.
  const picked = pickPortalClient(user, searchParams.cliente)
  const ordered = [picked, ...user.clients.filter((item) => item.id !== picked.id)]
  let found: { client: PortalClient; post: PortalPost } | null = null
  for (const candidate of ordered) {
    const post = (await getPortalPosts(candidate.id)).find((item) => item.id === params.id)
    if (post) {
      found = { client: candidate, post }
      break
    }
  }
  if (!found) notFound()
  const { client, post } = found

  const messages = await getPortalPostMessages(post.id)
  const today = todayKey()
  const status = portalStatus(post.stage)
  const gallery = postGallery(post)
  const slideTexts = post.slides.filter((slide) => slide.text.trim())

  return (
    <div className="space-y-6">
      <Link
        href={portalHref("/portal", client, user.clients)}
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {client.name}
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge stage={post.stage} />
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <FormatIcon format={post.format} />
            {CONTENT_FORMAT_LABEL[post.format]}
            <span aria-hidden>·</span>
            {post.networks.map((network) => CONTENT_NETWORK_LABEL[network]).join(", ")}
            <span aria-hidden>·</span>
            {publishLabel(post, today)}
          </span>
        </div>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">{post.title}</h1>
      </div>

      {canReview(post) ? (
        <ReviewPanel postId={post.id} />
      ) : status === "adjusting" ? (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-[13px] leading-5 text-muted-foreground">
          A equipe está fazendo os ajustes que você pediu. Quando o post voltar para você, ele aparece em “Para
          aprovar” e você responde de novo. Enquanto isso, pode conversar pelo chat abaixo.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <PostGallery paths={gallery} title={post.title} />

          {post.caption ? (
            <section className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">Legenda</h2>
              <p className="text-sm leading-6 break-words whitespace-pre-line text-foreground">{post.caption}</p>
            </section>
          ) : null}

          {slideTexts.length > 0 ? (
            <section className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">Texto dos slides</h2>
              <ol className="space-y-2">
                {post.slides.map((slide, index) =>
                  slide.text.trim() ? (
                    <li key={index} className="flex gap-2 text-sm leading-6 text-foreground">
                      <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{index + 1}.</span>
                      <span className="min-w-0 break-words whitespace-pre-line">{slide.text}</span>
                    </li>
                  ) : null
                )}
              </ol>
            </section>
          ) : null}
        </div>

        {/* Recomeça com as mensagens do servidor quando a página volta com novidade (ex.: depois de aprovar). */}
        <PostChat
          key={`${messages.length}-${messages.at(-1)?.id ?? ""}`}
          target={{ kind: "post", id: post.id }}
          initialMessages={messages}
        />
      </div>
    </div>
  )
}
