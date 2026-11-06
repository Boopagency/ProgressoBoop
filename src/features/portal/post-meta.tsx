import { ImageIcon } from "lucide-react"
import Link from "next/link"

import { publishLabel } from "@/features/content/logic"
import { FormatIcon } from "@/features/content/post-meta"
import {
  PORTAL_STATUS_LABEL,
  portalStatus,
  postThumbnail,
  type PortalPost,
  type PortalStatus,
} from "@/features/portal/content-logic"
import { PortalImage } from "@/features/portal/portal-image"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { ContentStage, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<PortalStatus, string> = {
  review: "border-warning/35 bg-warning/12 text-warning-ink",
  adjusting: "border-foreground/12 bg-muted text-muted-foreground",
  approved: "border-glow/25 bg-brand-soft text-brand-ink",
  scheduled: "border-glow/25 bg-brand-soft text-brand-ink",
  published: "border-success/30 bg-success/12 text-success-ink",
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
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
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
      {path ? <PortalImage path={path} alt="" fallback={empty} /> : empty}
    </div>
  )
}

/**
 * Linha de uma lista de posts: miniatura, título com a situação ao lado e,
 * embaixo, o formato e a data. A pílula fica na linha do título para a data
 * ter a largura toda e caber numa linha no celular. `meta="time"` mostra só o
 * horário (dentro de um dia do calendário, a data já está ao lado).
 */
export function PostListItem({
  post,
  href,
  today,
  meta = "date",
}: {
  post: PortalPost
  href: string
  today: DateKey
  meta?: "date" | "time"
}) {
  const when = meta === "time" ? (post.publish_time?.slice(0, 5) ?? publishLabel(post, today)) : publishLabel(post, today)
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <PostThumb post={post} className="aspect-[3/4] w-12 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{post.title}</p>
            <StatusBadge stage={post.stage} className="h-5 px-2 text-[11px] sm:h-6 sm:px-2.5 sm:text-xs" />
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <FormatIcon format={post.format} />
            <span aria-hidden>{CONTENT_FORMAT_LABEL[post.format]}</span>
            <span aria-hidden>·</span>
            <span className="truncate tabular-nums">{when}</span>
          </p>
        </div>
      </Link>
    </li>
  )
}
