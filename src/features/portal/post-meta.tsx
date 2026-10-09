import { ImageIcon } from "lucide-react"
import Link from "next/link"

import { ContentImage } from "@/features/content/content-image"
import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import {
  PORTAL_STATUS_LABEL,
  portalStatus,
  postThumbnail,
  type PortalPost,
  type PortalStatus,
} from "@/features/portal/content-logic"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { ContentStage, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<PortalStatus, string> = {
  review: "bg-warning/15 text-warning-ink",
  adjusting: "bg-muted text-muted-foreground",
  approved: "bg-brand-soft text-brand-ink",
  scheduled: "bg-brand-soft text-brand-ink",
  published: "bg-success/15 text-success-ink",
}

const STATUS_DOT: Record<PortalStatus, string> = {
  review: "bg-warning",
  adjusting: "border-2 border-muted-foreground/45",
  approved: "bg-brand/55",
  scheduled: "bg-brand",
  published: "bg-success",
}

export function StatusDot({ stage, className }: { stage: ContentStage; className?: string }) {
  const status = portalStatus(stage)
  return (
    <span
      role="img"
      aria-label={PORTAL_STATUS_LABEL[status]}
      className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)}
    />
  )
}

export function StatusBadge({ stage, className }: { stage: ContentStage; className?: string }) {
  const status = portalStatus(stage)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status],
        className
      )}
    >
      {PORTAL_STATUS_LABEL[status]}
    </span>
  )
}

/** Miniatura do post (capa ou primeiro slide), ou um quadro vazio com o ícone. */
export function PostThumb({ post, className }: { post: PortalPost; className?: string }) {
  const path = postThumbnail(post)
  const empty = (
    <div className="flex size-full items-center justify-center text-subtle-foreground">
      <ImageIcon className="size-5" />
    </div>
  )
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      {path ? <ContentImage path={path} alt="" fallback={empty} /> : empty}
    </div>
  )
}

/** Linha de uma lista de posts: miniatura, título, data e formato, e a situação. */
export function PostListItem({ post, href, today }: { post: PortalPost; href: string; today: DateKey }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <PostThumb post={post} className="aspect-[3/4] w-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{post.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FormatIcon format={post.format} />
            <span>{CONTENT_FORMAT_LABEL[post.format]}</span>
            <span aria-hidden>·</span>
            <span>{publishLabel(post, today)}</span>
          </p>
        </div>
        <StatusBadge stage={post.stage} />
      </Link>
    </li>
  )
}
