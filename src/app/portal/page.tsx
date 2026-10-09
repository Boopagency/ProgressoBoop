import type { Metadata } from "next"
import type { ReactNode } from "react"

import { portalHome, UPCOMING_DAYS } from "@/features/portal/content-logic"
import { getPortalPosts } from "@/features/portal/content-queries"
import { PortalNav, portalHref } from "@/features/portal/portal-nav"
import { PostListItem } from "@/features/portal/post-meta"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { greetingFor, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Portal" }

/** Início do portal: o que espera a aprovação do cliente, o que está em ajuste e o que vem por aí. */
export default async function PortalPage(props: PageProps<"/portal">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const posts = await getPortalPosts(client.id)
  const today = todayKey()
  const home = portalHome(posts, today)
  const postHref = (id: string) => portalHref(`/portal/posts/${id}`, client, user.clients)

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{client.name}</p>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">
          {greetingFor()}, {user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {home.review.length === 0
            ? "Nenhum post esperando a sua aprovação agora."
            : home.review.length === 1
              ? "Tem 1 post esperando a sua aprovação."
              : `Tem ${home.review.length} posts esperando a sua aprovação.`}
        </p>
      </div>

      <PortalNav section="inicio" client={client} clients={user.clients} />

      <Section title="Para aprovar" count={home.review.length} empty="Quando a equipe enviar um post para você, ele aparece aqui.">
        {home.review.map((post) => (
          <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
        ))}
      </Section>

      {home.adjusting.length > 0 ? (
        <Section
          title="Em ajuste"
          count={home.adjusting.length}
          description="A equipe está fazendo os ajustes que você pediu. Quando voltar, o post aparece em Para aprovar."
        >
          {home.adjusting.map((post) => (
            <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
          ))}
        </Section>
      ) : null}

      <Section
        title={`Próximos ${UPCOMING_DAYS} dias`}
        count={home.upcoming.length}
        empty="Nenhum post aprovado com data para os próximos dias."
      >
        {home.upcoming.map((post) => (
          <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
        ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  count,
  description,
  empty,
  children,
}: {
  title: string
  count: number
  description?: string
  empty?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {count > 0 ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span> : null}
        </h2>
        {description ? <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="rounded-xl border bg-card p-1.5">{children}</ul>
      )}
    </section>
  )
}
