"use client"

import { ExternalLink, Lightbulb, Plus } from "lucide-react"

import { SectionTitle } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { ConvertIdeaButton, LinkedPostLabel, useIdeaActions } from "@/features/content/idea-dialog"
import { splitIdeas } from "@/features/content/ideas-logic"
import type { PostSummary } from "@/features/content/logic"
import { ClientMark, FormatIcon } from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { ContentIdea, DateKey } from "@/lib/types"

/** Domínio do link de referência, para mostrar curto ("instagram.com"). */
function referenceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "link"
  }
}

/**
 * Visão Ideias do Conteúdo: o banco de ideias e referências dos clientes
 * filtrados, com "Virar post"; abaixo, as que já estão no cronograma.
 */
export function IdeasBoard({
  ideas,
  posts,
  today,
  onOpenIdea,
  onNewIdea,
  onOpenPost,
}: {
  /** Já filtradas pelo cliente. */
  ideas: ContentIdea[]
  posts: PostSummary[]
  today: DateKey
  onOpenIdea: (idea: ContentIdea) => void
  onNewIdea: () => void
  onOpenPost: (post: PostSummary) => void
}) {
  const { clientById } = useWorkspace()
  const actions = useIdeaActions(posts, onOpenPost)
  const { open, scheduled } = splitIdeas(ideas)
  const postById = new Map(posts.map((post) => [post.id, post]))

  if (ideas.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
        <Lightbulb className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-semibold">Guarde aqui as ideias e referências de cada cliente</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Título, notas, formato e o link da referência. Quando a ideia entrar no cronograma, “Virar post” cria o post
          já preenchido.
        </p>
        <Button size="sm" className="mt-5 gap-1.5" onClick={onNewIdea}>
          <Plus />
          Nova ideia
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle id="ideias-livres" count={open.length}>
          Ideias
        </SectionTitle>
        <Button variant="outline" size="sm" onClick={onNewIdea} className="gap-1.5 shadow-none">
          <Plus />
          Nova ideia
        </Button>
      </div>

      {open.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
          Todas as ideias já viraram post. Guarde a próxima em “Nova ideia”.
        </p>
      ) : (
        <ul aria-labelledby="ideias-livres" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((idea) => (
            <li key={idea.id} className="relative flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClientMark clientId={idea.client_id} size="xs" />
                <span className="truncate">{clientById.get(idea.client_id)?.name ?? "Cliente"}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenIdea(idea)}
                className="mt-2 text-left text-sm font-medium break-words text-foreground outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
              >
                {idea.title}
              </button>
              {idea.notes ? (
                <p className="mt-1 line-clamp-3 text-[13px] leading-5 whitespace-pre-line text-muted-foreground">{idea.notes}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
                {idea.format ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FormatIcon format={idea.format} className="size-3" />
                    {CONTENT_FORMAT_LABEL[idea.format]}
                  </span>
                ) : null}
                {idea.reference_url ? (
                  <a
                    href={idea.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 inline-flex max-w-40 items-center gap-1 text-xs text-muted-foreground hover:text-brand-ink hover:underline"
                  >
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{referenceHost(idea.reference_url)}</span>
                  </a>
                ) : null}
                <ConvertIdeaButton
                  format={idea.format}
                  onConvert={(format) => actions.convert(idea, format)}
                  pending={actions.convertingId === idea.id}
                  disabled={actions.convertingId !== null}
                  className="relative z-10 ml-auto h-7 px-2 text-xs"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {scheduled.length > 0 ? (
        <section aria-labelledby="ideias-no-cronograma" className="mt-8">
          <SectionTitle id="ideias-no-cronograma" count={scheduled.length}>
            No cronograma
          </SectionTitle>
          <ul className="mt-2 -mx-3">
            {scheduled.map((idea) => (
              <li key={idea.id} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
                <ClientMark clientId={idea.client_id} size="md" />
                <button type="button" onClick={() => onOpenIdea(idea)} className="min-w-0 flex-1 text-left outline-none">
                  <span className="block truncate text-sm text-foreground">{idea.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="max-w-40 truncate">{clientById.get(idea.client_id)?.name ?? "Cliente"}</span>
                    <span aria-hidden="true" className="text-subtle-foreground">·</span>
                    <LinkedPostLabel post={idea.post_id ? postById.get(idea.post_id) : undefined} today={today} />
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => actions.openPost(idea)}
                  className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                >
                  Ver post
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
