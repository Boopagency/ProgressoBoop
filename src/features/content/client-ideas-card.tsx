"use client"

import { ExternalLink, Plus } from "lucide-react"
import Link from "next/link"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { ConvertIdeaButton, IdeaDialog, useIdeaActions, useIdeaDialog } from "@/features/content/idea-dialog"
import { splitIdeas } from "@/features/content/ideas-logic"
import type { PostSummary } from "@/features/content/logic"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { FormatIcon } from "@/features/content/post-meta"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { ContentIdea } from "@/lib/types"

const VISIBLE = 5

/**
 * Página do cliente: o banco de ideias dele (as livres, a mais nova
 * primeiro), com "Virar post" e o atalho para a visão Ideias do Conteúdo.
 */
export function ClientIdeasCard({ clientId, ideas, posts }: { clientId: string; ideas: ContentIdea[]; posts: PostSummary[] }) {
  const postDialog = usePostDialog()
  const ideaDialog = useIdeaDialog()
  const actions = useIdeaActions(posts, postDialog.openPost)
  const { open, scheduled } = splitIdeas(ideas.filter((idea) => idea.client_id === clientId))

  return (
    <PanelCard
      id="ideias-cliente"
      title={
        <>
          Ideias
          <PanelCount value={open.length} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => ideaDialog.openNew({ client_id: clientId })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Ideia
        </Button>
      }
    >
      {open.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          {scheduled.length > 0
            ? "Todas as ideias deste cliente já viraram post."
            : "Guarde aqui ideias e referências para os próximos posts deste cliente."}
        </p>
      ) : (
        <ul className="px-1 py-1">
          {open.slice(0, VISIBLE).map((idea) => (
            <li key={idea.id} className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
              <button type="button" onClick={() => ideaDialog.openIdea(idea)} className="min-w-0 flex-1 text-left outline-none">
                <span className="block truncate text-sm font-medium text-foreground">{idea.title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
                  {idea.format ? (
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <FormatIcon format={idea.format} className="size-3" />
                      {CONTENT_FORMAT_LABEL[idea.format]}
                    </span>
                  ) : (
                    <span className="shrink-0">Sem formato</span>
                  )}
                  {idea.reference_url ? (
                    <>
                      <span aria-hidden="true" className="text-subtle-foreground">·</span>
                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                        <ExternalLink className="size-3" aria-hidden="true" />
                        com referência
                      </span>
                    </>
                  ) : null}
                  {idea.notes ? (
                    <>
                      <span aria-hidden="true" className="text-subtle-foreground">·</span>
                      <span className="truncate">{idea.notes}</span>
                    </>
                  ) : null}
                </span>
              </button>
              <ConvertIdeaButton
                format={idea.format}
                onConvert={(format) => actions.convert(idea, format)}
                pending={actions.convertingId === idea.id}
                disabled={actions.convertingId !== null}
                variant="ghost"
                className="h-7 shrink-0 px-2 text-xs"
              />
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/conteudo?cliente=${clientId}&ver=ideias`}
        className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span>{open.length > VISIBLE ? `Ver todas (${open.length}) no Conteúdo` : "Abrir no Conteúdo"}</span>
        {scheduled.length > 0 ? (
          <span className="font-normal">{scheduled.length} no cronograma</span>
        ) : null}
      </Link>
      <IdeaDialog state={ideaDialog.state} onOpenChange={ideaDialog.onOpenChange} posts={posts} onOpenPost={postDialog.openPost} />
      <PostDialog state={postDialog.state} onOpenChange={postDialog.onOpenChange} />
    </PanelCard>
  )
}
