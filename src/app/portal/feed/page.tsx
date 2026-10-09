import { Pin } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { ContentImage } from "@/features/content/content-image"
import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import { PORTAL_STATUS_LABEL, portalFeed, portalStatus, postThumbnail } from "@/features/portal/content-logic"
import { getPortalPosts, getPortalProfile } from "@/features/portal/content-queries"
import { PortalNav, portalHref } from "@/features/portal/portal-nav"
import { StatusDot } from "@/features/portal/post-meta"
import { ProfilePhoto } from "@/features/portal/profile-photo"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Feed" }

/** Prévia do Instagram do cliente: o perfil e o grid com os posts que já chegaram a ele. */
export default async function PortalFeedPage(props: PageProps<"/portal/feed">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const [posts, profile] = await Promise.all([getPortalPosts(client.id), getPortalProfile(client.id)])
  const today = todayKey()
  const tiles = portalFeed(posts)

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">{client.name}</h1>
      <PortalNav section="feed" client={client} clients={user.clients} />

      <div className="mx-auto w-full max-w-[600px]">
        <div className="flex items-center gap-4 sm:gap-6">
          <ProfilePhoto clientId={client.id} name={client.name} path={profile?.avatar_path ?? null} />
          <div className="min-w-0 flex-1">
            {profile?.instagram_handle ? (
              <p className="truncate text-base font-semibold text-foreground">@{profile.instagram_handle}</p>
            ) : null}
            <p className="mt-1 text-sm text-foreground">
              <span className="font-semibold tabular-nums">{tiles.length}</span> {tiles.length === 1 ? "post" : "posts"}
            </p>
          </div>
        </div>
        <div className="mt-3 text-sm">
          <p className="font-semibold text-foreground">{client.name}</p>
          {profile?.instagram_bio ? (
            <p className="mt-0.5 break-words whitespace-pre-line text-foreground">{profile.instagram_bio}</p>
          ) : null}
        </div>

        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Como o perfil vai ficar com os posts que você já viu. Stories não entram no feed.
        </p>

        {tiles.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nenhum post do Instagram por aqui ainda.
          </p>
        ) : (
          <ul aria-label="Grid do feed" className="mt-3 grid grid-cols-3 gap-0.5">
            {tiles.map((post) => {
              const path = postThumbnail(post)
              const label = [
                post.title,
                CONTENT_FORMAT_LABEL[post.format],
                publishLabel(post, today),
                PORTAL_STATUS_LABEL[portalStatus(post.stage)],
                post.pinned ? "Fixado" : null,
              ]
                .filter(Boolean)
                .join(" · ")
              const title = (
                <span className="absolute inset-0 flex items-center justify-center p-2 text-center sm:p-3">
                  <span className="line-clamp-5 text-[11px] leading-snug font-medium break-words text-muted-foreground sm:text-xs">
                    {post.title}
                  </span>
                </span>
              )
              return (
                <li key={post.id} className="group relative">
                  <Link
                    href={portalHref(`/portal/posts/${post.id}`, client, user.clients)}
                    aria-label={label}
                    title={label}
                    className="relative block aspect-[3/4] w-full overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {path ? (
                      <ContentImage path={path} fallback={title} className="transition-opacity group-hover:opacity-90" />
                    ) : (
                      title
                    )}
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
                        className="absolute bottom-1.5 left-1.5 flex size-4 items-center justify-center rounded-full bg-background/90 shadow-sm"
                      >
                        <StatusDot stage={post.stage} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
