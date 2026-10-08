"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { ContentFeed } from "@/features/content/content-feed"
import { groupByStage, nextPosts, type PostSummary } from "@/features/content/logic"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { PostRow, StageDot } from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { CONTENT_STAGE_LABEL, CONTENT_STAGES } from "@/lib/labels"
import type { DateKey } from "@/lib/types"

const VISIBLE = 5
/** Quadrados do feed no cartão (quatro linhas); o resto, no Conteúdo. */
const FEED_VISIBLE = 12

type CardMode = "list" | "feed"

const MODE_OPTIONS: { value: CardMode; label: string }[] = [
  { value: "list", label: "Próximos" },
  { value: "feed", label: "Feed" },
]

/**
 * Página do cliente: quantos posts em cada etapa, os próximos e o atalho para
 * a visão central filtrada; ou o preview do feed do Instagram do cliente.
 */
export function ClientContentCard({ clientId, posts, today }: { clientId: string; posts: PostSummary[]; today: DateKey }) {
  const dialog = usePostDialog()
  const { clientById } = useWorkspace()
  const [mode, setMode] = useState<CardMode>("list")
  const client = clientById.get(clientId)
  const own = posts.filter((post) => post.client_id === clientId)
  const upcoming = nextPosts(own)
  const columns = groupByStage(own)
  const stages = CONTENT_STAGES.filter((stage) => columns[stage].length > 0)

  return (
    <PanelCard
      id="conteudo-cliente"
      title={
        <>
          Conteúdo
          <PanelCount value={upcoming.length} />
        </>
      }
      action={
        <div className="flex items-center gap-1.5">
          {client ? <SegmentedControl aria-label="Mostrar" value={mode} onValueChange={setMode} options={MODE_OPTIONS} /> : null}
          <Button variant="ghost" size="sm" onClick={() => dialog.openNew({ client_id: clientId })} className="h-7 gap-1 px-2 text-xs">
            <Plus className="size-3.5" />
            Post
          </Button>
        </div>
      }
    >
      {mode === "feed" && client ? (
        <div className="px-4 py-4">
          <ContentFeed
            client={client}
            posts={own}
            today={today}
            onOpen={dialog.openPost}
            limit={FEED_VISIBLE}
            moreHref={`/conteudo?cliente=${clientId}&ver=feed`}
            className="max-w-[480px]"
          />
        </div>
      ) : own.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Planeje os posts deste cliente: formato, data, etapa e o que falta em copy, design e vídeo.
        </p>
      ) : (
        <>
          <ul aria-label="Posts por etapa" className="flex flex-wrap gap-x-4 gap-y-1.5 border-b px-4 py-3 text-xs">
            {stages.map((stage) => (
              <li key={stage} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <StageDot stage={stage} />
                {CONTENT_STAGE_LABEL[stage]}
                <span className="font-medium text-foreground tabular-nums">{columns[stage].length}</span>
              </li>
            ))}
          </ul>
          {upcoming.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">Nada em produção: os posts deste cliente já foram publicados.</p>
          ) : (
            <div className="px-1 py-1">
              {upcoming.slice(0, VISIBLE).map((post) => (
                <PostRow key={post.id} post={post} today={today} onOpen={dialog.openPost} showClient={false} />
              ))}
            </div>
          )}
        </>
      )}
      {mode === "list" || !client ? (
        <Link
          href={`/conteudo?cliente=${clientId}`}
          className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {upcoming.length > VISIBLE ? `Ver todos (${upcoming.length}) no Conteúdo` : "Abrir no Conteúdo"}
        </Link>
      ) : null}
      <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />
    </PanelCard>
  )
}
