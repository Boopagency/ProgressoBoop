"use client"

import { upcomingPosts, type PostSummary } from "@/features/content/logic"
import { PostRow } from "@/features/content/post-meta"
import { addDaysToKey, capitalize, formatDayMonth, formatWeekdayLong } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

function dayTitle(day: DateKey, today: DateKey): string {
  if (day === today) return "Hoje"
  if (day === addDaysToKey(today, 1)) return "Amanhã"
  return `${capitalize(formatWeekdayLong(day))}, ${formatDayMonth(day)}`
}

/**
 * Próximos 7 dias: os atrasados, depois hoje, amanhã e o resto da semana,
 * com o que falta em cada frente (copy, design, vídeo).
 */
export function UpcomingList({ posts, today, onOpen }: { posts: PostSummary[]; today: DateKey; onOpen: (post: PostSummary) => void }) {
  const { late, days } = upcomingPosts(posts, today)
  if (late.length === 0 && days.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Nenhum post para os próximos 7 dias nem atrasado.
      </p>
    )
  }
  return (
    <div className="mt-6 space-y-8">
      {late.length > 0 ? <DaySection id="atrasados" title="Atrasados" danger posts={late} today={today} onOpen={onOpen} /> : null}
      {days.map(({ day, posts: list }) => (
        <DaySection key={day} id={`dia-${day}`} title={dayTitle(day, today)} brand={day === today} posts={list} today={today} onOpen={onOpen} />
      ))}
    </div>
  )
}

function DaySection({
  id,
  title,
  posts,
  today,
  onOpen,
  danger = false,
  brand = false,
}: {
  id: string
  title: string
  posts: PostSummary[]
  today: DateKey
  onOpen: (post: PostSummary) => void
  danger?: boolean
  brand?: boolean
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex h-8 items-center gap-2 border-b border-border/80">
        {brand ? <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" /> : null}
        <h2 id={id} className={cn("flex items-center gap-2 text-sm font-semibold", danger ? "text-overdue" : "text-foreground")}>
          {title}
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{posts.length}</span>
        </h2>
      </div>
      <div className="-mx-3 mt-1">
        {posts.map((post) => (
          <PostRow key={post.id} post={post} today={today} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
