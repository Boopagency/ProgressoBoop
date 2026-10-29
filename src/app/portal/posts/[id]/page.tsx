import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageBody, PageContainer, PageHeader, PageMeta } from "@/components/layout/page"
import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import { InstagramCaption, InstagramHeader } from "@/features/content/instagram-post"
import { PostGallery } from "@/features/content/post-gallery"
import { getPortalPostReadings } from "@/features/instagram/metrics-queries"
import { MetricsEvolution, MetricsGrid, ReadingNote } from "@/features/instagram/metrics-view"
import { canReview, portalStatus, postGallery, type PortalPost } from "@/features/portal/content-logic"
import { getPortalPostMessages, getPortalPosts, getPortalProfile } from "@/features/portal/content-queries"
import { PostChat } from "@/features/portal/post-chat"
import { StatusBadge } from "@/features/portal/post-meta"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { ReviewPanel } from "@/features/portal/review-panel"
import { pickPortalClient, requirePortalUser, type PortalClient } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_NETWORK_LABEL } from "@/lib/labels"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Post" }

/**
 * Post aberto no portal: as imagens, a legenda, a resposta do cliente, os
 * números do Instagram (publicado) e o chat com a equipe.
 */
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

  const [messages, profile, readings] = await Promise.all([
    getPortalPostMessages(post.id),
    // Sem o perfil, o post abre do mesmo jeito (o cabeçalho mostra o nome do cliente).
    getPortalProfile(client.id).catch(() => null),
    // Os números do Instagram, só no publicado (sem eles, o post abre do mesmo jeito).
    post.stage === "published" ? getPortalPostReadings(post.id).catch(() => []) : Promise.resolve([]),
  ])
  const latest = readings.at(-1) ?? null
  const handle = profile?.instagram_handle ?? null
  const today = todayKey()
  const status = portalStatus(post.stage)
  const gallery = postGallery(post)
  const slideTexts = post.slides.filter((slide) => slide.text.trim())
  const reviewing = canReview(post)

  return (
    <PageContainer>
      <PageHeader
        title={post.title}
        description={
          <PageMeta
            items={[
              <StatusBadge key="status" stage={post.stage} />,
              <span key="format" className="flex items-center gap-1.5">
                <FormatIcon format={post.format} />
                {CONTENT_FORMAT_LABEL[post.format]}
              </span>,
              post.networks.map((network) => CONTENT_NETWORK_LABEL[network]).join(", "),
              publishLabel(post, today),
              user.clients.length > 1 ? client.name : null,
            ]}
          />
        }
      />

      <PageBody>

      {reviewing ? (
        <ReviewPanel postId={post.id} />
      ) : status === "adjusting" ? (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-[13px] leading-5 text-muted-foreground">
          A equipe está fazendo os ajustes que você pediu. Quando o post voltar para você, ele aparece em “Para
          aprovar” e você responde de novo. Enquanto isso, pode conversar pelo chat abaixo.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* No celular, como no Instagram: a foto e o @, o carrossel e a legenda com "mais". */}
          <div className="space-y-3">
            <InstagramHeader
              className="md:hidden"
              avatar={<ProfilePhoto clientId={client.id} name={client.name} path={profile?.avatar_path ?? null} size="sm" />}
              handle={handle}
              name={client.name}
            />
            <PostGallery paths={gallery} title={post.title} />
            {post.caption ? <InstagramCaption className="md:hidden" handle={handle} name={client.name} text={post.caption} /> : null}
          </div>

          {latest ? (
            <section aria-labelledby="desempenho" className="space-y-2">
              <h2 id="desempenho" className="text-sm font-semibold text-foreground">
                Desempenho no Instagram
              </h2>
              <MetricsGrid reading={latest} />
              <ReadingNote reading={latest} />
              <MetricsEvolution readings={readings} />
            </section>
          ) : null}

          {post.caption ? (
            <section className="hidden space-y-1.5 md:block">
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
      {/* Espaço para a barra fixa de Aprovar e Pedir ajuste no celular. */}
      {reviewing ? <div aria-hidden="true" className="h-20 md:hidden" /> : null}
      </PageBody>
    </PageContainer>
  )
}
