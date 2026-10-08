"use client"

import { useState } from "react"

import { BOARD_PUBLISHED_DAYS, boardColumns, publishLabel, type PostSummary } from "@/features/content/logic"
import { ClientMark, FormatIcon, FrontDots, PostFlags, StageDot } from "@/features/content/post-meta"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { CONTENT_FORMAT_LABEL, CONTENT_STAGE_LABEL, CONTENT_STAGES } from "@/lib/labels"
import type { ContentStage, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const DRAG_TYPE = "application/x-boop-post"

const EMPTY_TEXT: Partial<Record<ContentStage, string>> = {
  client_review: "Nada esperando o cliente.",
  published: "Nada publicado nesses dias.",
}

/**
 * Quadro por etapa, com os posts de todos os clientes. Arrastar um cartão
 * muda a etapa; onde arrastar não funciona (alguns celulares), a etapa muda
 * no post. Publicado mostra os últimos 30 dias.
 */
export function ContentBoard({
  posts,
  today,
  onOpen,
  onMove,
}: {
  posts: PostSummary[]
  today: DateKey
  onOpen: (post: PostSummary) => void
  onMove: (id: string, stage: ContentStage) => void
}) {
  const [over, setOver] = useState<ContentStage | null>(null)
  const columns = boardColumns(posts, today)

  // relative: os textos só para leitores de tela (sr-only) ficam presos à rolagem do quadro.
  return (
    <div className="relative -mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:snap-none">
      {CONTENT_STAGES.map((stage) => (
        <section
          key={stage}
          aria-label={CONTENT_STAGE_LABEL[stage]}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            if (over !== stage) setOver(stage)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setOver(null)
            const id = event.dataTransfer.getData(DRAG_TYPE)
            if (id) onMove(id, stage)
          }}
          className={cn(
            "flex w-[80%] shrink-0 snap-start flex-col rounded-xl border bg-muted/30 transition-colors sm:w-64 xl:w-auto xl:min-w-0 xl:flex-1",
            over === stage && "border-brand/50 bg-brand-soft/30"
          )}
        >
          <header className="flex items-center gap-2 px-3 pt-3 pb-2">
            <StageDot stage={stage} />
            <h2 className="truncate text-[13px] font-semibold text-foreground">{CONTENT_STAGE_LABEL[stage]}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{columns[stage].length}</span>
            {stage === "published" ? (
              <span className="ml-auto shrink-0 text-[11px] text-subtle-foreground">{BOARD_PUBLISHED_DAYS} dias</span>
            ) : null}
          </header>
          <div role="list" className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
            {columns[stage].length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-subtle-foreground">{EMPTY_TEXT[stage] ?? "Arraste um post para cá."}</p>
            ) : (
              columns[stage].map((post) => <BoardCard key={post.id} post={post} today={today} onOpen={onOpen} />)
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function BoardCard({ post, today, onOpen }: { post: PostSummary; today: DateKey; onOpen: (post: PostSummary) => void }) {
  const { profiles, clientById } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === post.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  return (
    <div
      role="listitem"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, post.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      className="rounded-lg border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_6px_0_rgb(0_0_0/0.08)]"
    >
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="block w-full rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ClientMark clientId={post.client_id} size="xs" />
          <span className="truncate text-xs text-muted-foreground">{clientById.get(post.client_id)?.name}</span>
          {owner ? (
            <PersonAvatar
              name={owner.full_name}
              avatarUrl={owner.avatar_url}
              colorIndex={ownerIndex}
              size="sm"
              className="ml-auto size-5 shrink-0 [&_[data-slot=avatar-fallback]]:text-[10px]"
            />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 text-[13.5px] leading-5 font-medium text-foreground">{post.title}</span>
        <span className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={CONTENT_FORMAT_LABEL[post.format]}>
          <FormatIcon format={post.format} className="size-3" />
          <span className="truncate tabular-nums">{publishLabel(post, today)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <PostFlags post={post} today={today} />
          <FrontDots post={post} />
        </span>
      </button>
    </div>
  )
}
