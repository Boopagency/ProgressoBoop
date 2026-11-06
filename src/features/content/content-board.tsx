"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { dragSource, KANBAN_CARD, KanbanBoard, KanbanColumn, KanbanColumnHeader, KanbanEmpty, useKanbanDrop } from "@/components/kanban"
import { BOARD_PUBLISHED_DAYS, boardColumns, publishLabel, type PostSummary } from "@/features/content/logic"
import { AutoPublishMark, ClientMark, FormatIcon, FrontDots, PostFlags, StageDot } from "@/features/content/post-meta"
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
 * muda a etapa (só no computador); no celular, o quadro vira uma lista por
 * etapa e a etapa muda no post. Publicado mostra os últimos 30 dias.
 */
export function ContentBoard({
  posts,
  today,
  onOpen,
  onMove,
  className,
}: {
  posts: PostSummary[]
  today: DateKey
  onOpen: (post: PostSummary) => void
  onMove: (id: string, stage: ContentStage) => void
  className?: string
}) {
  const { over, dropTarget } = useKanbanDrop<ContentStage>(DRAG_TYPE, onMove)
  const columns = boardColumns(posts, today)

  // relative: os textos só para leitores de tela (sr-only) ficam presos à rolagem do quadro.
  return (
    <>
      <BoardList columns={columns} today={today} onOpen={onOpen} />
      <KanbanBoard className={cn("relative max-md:hidden", className)}>
        {CONTENT_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            label={CONTENT_STAGE_LABEL[stage]}
            active={over === stage}
            {...dropTarget(stage)}
            header={
              <KanbanColumnHeader
                dot={<StageDot stage={stage} className="size-2.5" />}
                title={CONTENT_STAGE_LABEL[stage]}
                count={columns[stage].length}
                hint={stage === "published" ? `últimos ${BOARD_PUBLISHED_DAYS} dias` : " "}
              />
            }
          >
            {columns[stage].length === 0 ? (
              <KanbanEmpty>{EMPTY_TEXT[stage] ?? "Arraste um post para cá."}</KanbanEmpty>
            ) : (
              columns[stage].map((post) => <BoardCard key={post.id} post={post} today={today} onOpen={onOpen} />)
            )}
          </KanbanColumn>
        ))}
      </KanbanBoard>
    </>
  )
}

/** Celular: uma lista por etapa, que abre e fecha (Publicado começa fechado). */
function BoardList({
  columns,
  today,
  onOpen,
}: {
  columns: Record<ContentStage, PostSummary[]>
  today: DateKey
  onOpen: (post: PostSummary) => void
}) {
  const [closed, setClosed] = useState<ContentStage[]>(["published"])
  return (
    <div className="space-y-2 md:hidden">
      {CONTENT_STAGES.map((stage) => {
        const open = !closed.includes(stage)
        const list = columns[stage]
        return (
          <section key={stage} aria-label={CONTENT_STAGE_LABEL[stage]} className="rounded-2xl border border-glass-edge bg-board">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setClosed((current) => (open ? [...current, stage] : current.filter((item) => item !== stage)))}
              className="flex min-h-12 w-full items-center gap-2 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <StageDot stage={stage} />
              <h2 className="truncate text-sm font-semibold text-foreground">{CONTENT_STAGE_LABEL[stage]}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
              {stage === "published" ? <span className="text-[11px] text-subtle-foreground">{BOARD_PUBLISHED_DAYS} dias</span> : null}
              <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
              <div role="list" className="flex flex-col gap-2 px-2 pb-2">
                {list.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-subtle-foreground">{EMPTY_TEXT[stage] ?? "Nenhum post nesta etapa."}</p>
                ) : (
                  list.map((post) => <BoardCard key={post.id} post={post} today={today} onOpen={onOpen} draggable={false} />)
                )}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({
  post,
  today,
  onOpen,
  draggable = true,
}: {
  post: PostSummary
  today: DateKey
  onOpen: (post: PostSummary) => void
  draggable?: boolean
}) {
  const { profiles, clientById } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === post.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  return (
    <div role="listitem" {...(draggable ? dragSource(DRAG_TYPE, post.id) : {})} className={cn(KANBAN_CARD, !draggable && "cursor-pointer")}>
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="block w-full rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ClientMark clientId={post.client_id} size="sm" />
          <span className="truncate text-[13px] text-muted-foreground">{clientById.get(post.client_id)?.name}</span>
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
        <span className="mt-2 line-clamp-3 text-[15px] leading-5 font-semibold text-foreground">{post.title}</span>
        <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground" title={CONTENT_FORMAT_LABEL[post.format]}>
          <FormatIcon format={post.format} className="size-3.5" />
          <span className="truncate tabular-nums">{publishLabel(post, today)}</span>
          <AutoPublishMark post={post} />
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <PostFlags post={post} today={today} />
          <FrontDots post={post} />
        </span>
      </button>
    </div>
  )
}
