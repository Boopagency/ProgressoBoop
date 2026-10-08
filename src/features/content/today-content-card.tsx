"use client"

import Link from "next/link"

import { todayContent, type PostSummary } from "@/features/content/logic"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { ClientMark, FormatIcon, StageDot } from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import { CONTENT_STAGE_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const VISIBLE = 6

/**
 * Tela Hoje: posts atrasados, os que saem hoje e os que esperam o cliente.
 * No "Minhas", os da pessoa e os sem responsável. Sem nada, não aparece.
 */
export function TodayContentCard({
  posts,
  today,
  scope,
  className,
}: {
  posts: PostSummary[]
  today: DateKey
  scope: "mine" | "all"
  className?: string
}) {
  const { currentUser, clientById } = useWorkspace()
  const dialog = usePostDialog()
  const visible = scope === "all" ? posts : posts.filter((post) => post.owner_id === currentUser.id || post.owner_id === null)
  const { late, today: dueToday, awaitingClient } = todayContent(visible, today)
  const rows = [
    ...late.map((post) => ({ post, detail: `Atrasado · era ${formatShortDate(post.publish_on!, today)}`, tone: "late" as const })),
    ...dueToday.map((post) => ({
      post,
      detail: `Hoje${post.publish_time ? ` · ${post.publish_time.slice(0, 5)}` : ""} · ${CONTENT_STAGE_LABEL[post.stage]}`,
      tone: "today" as const,
    })),
    ...awaitingClient.map((post) => ({
      post,
      detail: `Aguardando cliente${post.publish_on ? ` · sai ${formatShortDate(post.publish_on, today)}` : ""}`,
      tone: "waiting" as const,
    })),
  ]
  // Sem nada, o quadro some (o post aberto continua aberto até fechar).
  if (rows.length === 0) return <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />

  return (
    <section aria-labelledby="conteudo-hoje" className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
        <h2 id="conteudo-hoje" className="text-sm font-semibold text-foreground">
          Conteúdo
        </h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {[
            late.length > 0 ? `${late.length} ${late.length === 1 ? "atrasado" : "atrasados"}` : null,
            dueToday.length > 0 ? `${dueToday.length} hoje` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </header>
      <ul className="px-1 pb-1">
        {rows.slice(0, VISIBLE).map(({ post, detail, tone }) => (
          <li key={post.id}>
            <button
              type="button"
              onClick={() => dialog.openPost(post)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
            >
              <ClientMark clientId={post.client_id} size="sm" className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium break-words text-foreground">
                  <FormatIcon format={post.format} className="mr-1 inline size-3 align-[-1px] text-muted-foreground" />
                  {post.title}
                </span>
                <span
                  className={cn(
                    "block text-xs break-words",
                    tone === "late" ? "font-medium text-overdue" : tone === "waiting" ? "text-warning-ink" : "text-muted-foreground"
                  )}
                >
                  {tone === "today" ? <StageDot stage={post.stage} className="mr-1 size-1.5 align-middle" /> : null}
                  {detail} · {clientById.get(post.client_id)?.name}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Link href="/conteudo?ver=lista" className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        {rows.length > VISIBLE ? `Ver todos (${rows.length}) no Conteúdo` : "Abrir o Conteúdo"}
      </Link>
      <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />
    </section>
  )
}
