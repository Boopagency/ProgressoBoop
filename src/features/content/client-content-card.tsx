"use client"

import { Plus } from "lucide-react"
import Link from "next/link"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { groupByStage, nextPosts, type PostSummary } from "@/features/content/logic"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { PostRow, StageDot } from "@/features/content/post-meta"
import { CONTENT_STAGE_LABEL, CONTENT_STAGES } from "@/lib/labels"
import type { DateKey } from "@/lib/types"

const VISIBLE = 5

/** Página do cliente: quantos posts em cada etapa, os próximos e o atalho para a visão central filtrada. */
export function ClientContentCard({ clientId, posts, today }: { clientId: string; posts: PostSummary[]; today: DateKey }) {
  const dialog = usePostDialog()
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
        <Button variant="ghost" size="sm" onClick={() => dialog.openNew({ client_id: clientId })} className="h-7 gap-1 px-2 text-xs">
          <Plus className="size-3.5" />
          Post
        </Button>
      }
    >
      {own.length === 0 ? (
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
      <Link
        href={`/conteudo?cliente=${clientId}`}
        className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {upcoming.length > VISIBLE ? `Ver todos (${upcoming.length}) no Conteúdo` : "Abrir no Conteúdo"}
      </Link>
      <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />
    </PanelCard>
  )
}
