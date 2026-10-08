"use client"

import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useState } from "react"

import { SegmentedControl } from "@/components/segmented-control"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isWeekend } from "@/features/calendar/logic"
import type { CalendarMode } from "@/features/content/filters"
import { comparePosts, groupByDay, postsInRange, type PostSummary } from "@/features/content/logic"
import {
  attentionDot,
  ClientMark,
  clientDotColor,
  FormatIcon,
  PostFlags,
  PostRow,
  StageDot,
} from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import {
  addDaysToKey,
  addMonthsToKey,
  capitalize,
  eachDayKey,
  formatDayMonth,
  formatMonthYear,
  formatRange,
  formatWeekdayLong,
  formatWeekdayShort,
  isWithin,
  monthGridRangeOf,
  monthRangeOf,
  weekRangeOf,
} from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_STAGE_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const MODE_OPTIONS = [
  { value: "month", label: "Mês" },
  { value: "week", label: "Semana" },
] as const

const VISIBLE_IN_CELL = 3

/** Descrição completa do post para leitores de tela e para o "title" dos itens compactos. */
function describe(post: PostSummary, clientName: string, late: boolean): string {
  return [
    post.title,
    clientName,
    CONTENT_FORMAT_LABEL[post.format],
    post.publish_time ? post.publish_time.slice(0, 5) : null,
    CONTENT_STAGE_LABEL[post.stage],
    late ? "atenção" : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Calendário dos posts de todos os clientes: mês (padrão) ou semana. Cada
 * post mostra o cliente (inicial na cor dele), o formato, a etapa e um sinal
 * quando está atrasado ou com falta material. Posts sem data ficam abaixo.
 */
export function ContentCalendar({
  posts,
  today,
  mode,
  anchor,
  onNavigate,
  onOpen,
  onCreate,
}: {
  posts: PostSummary[]
  today: DateKey
  mode: CalendarMode
  anchor: DateKey | null
  onNavigate: (next: { mode?: CalendarMode; anchor?: DateKey | null }) => void
  onOpen: (post: PostSummary) => void
  onCreate: (day: DateKey) => void
}) {
  const reference = anchor ?? today
  const range = mode === "week" ? weekRangeOf(reference) : monthGridRangeOf(reference)
  const days = eachDayKey(range)
  const byDay = groupByDay(postsInRange(posts, range))
  const undated = posts.filter((post) => post.publish_on === null).sort(comparePosts)
  const showsToday = isWithin(today, mode === "week" ? range : monthRangeOf(reference))

  function go(next: DateKey) {
    onNavigate({ anchor: next === today ? null : next })
  }

  function step(direction: -1 | 1) {
    go(mode === "week" ? addDaysToKey(reference, 7 * direction) : addMonthsToKey(monthRangeOf(reference).start, direction))
  }

  const label =
    mode === "month"
      ? formatMonthYear(reference)
      : range.start.slice(0, 4) === range.end.slice(0, 4)
        ? `${formatRange(range)} de ${range.end.slice(0, 4)}`
        : formatRange(range)

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" aria-label={mode === "week" ? "Semana anterior" : "Mês anterior"} onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={mode === "week" ? "Próxima semana" : "Próximo mês"} onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground" aria-live="polite">
            {label}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className={cn("ml-1 h-7 px-2.5 text-xs shadow-none", showsToday && "invisible")}
            onClick={() => go(today)}
          >
            Hoje
          </Button>
        </div>
        <SegmentedControl aria-label="Período" value={mode} onValueChange={(next) => onNavigate({ mode: next })} options={MODE_OPTIONS} />
      </div>

      {mode === "month" ? (
        <MonthGrid days={days} month={monthRangeOf(reference).start.slice(0, 7)} today={today} byDay={byDay} onOpen={onOpen} />
      ) : (
        <WeekGrid days={days} today={today} byDay={byDay} onOpen={onOpen} onCreate={onCreate} />
      )}

      {undated.length > 0 ? <UndatedPosts posts={undated} today={today} onOpen={onOpen} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mês                                                                 */
/* ------------------------------------------------------------------ */

function MonthGrid({
  days,
  month,
  today,
  byDay,
  onOpen,
}: {
  days: DateKey[]
  /** "yyyy-MM" do mês exibido. */
  month: string
  today: DateKey
  byDay: Map<DateKey, PostSummary[]>
  onOpen: (post: PostSummary) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-1 py-2 text-center text-xs text-muted-foreground @3xl:px-2 @3xl:text-left">
            {formatWeekdayShort(day)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <MonthCell
            key={day}
            day={day}
            outside={!day.startsWith(month)}
            isToday={day === today}
            firstColumn={index % 7 === 0}
            firstRow={index < 7}
            posts={byDay.get(day) ?? []}
            today={today}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCell({
  day,
  outside,
  isToday,
  firstColumn,
  firstRow,
  posts,
  today,
  onOpen,
}: {
  day: DateKey
  outside: boolean
  isToday: boolean
  firstColumn: boolean
  firstRow: boolean
  posts: PostSummary[]
  today: DateKey
  onOpen: (post: PostSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const hidden = Math.max(posts.length - VISIBLE_IN_CELL, 0)

  function openPost(post: PostSummary) {
    setOpen(false)
    onOpen(post)
  }

  const dayNumber = (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums",
        isToday && "bg-brand font-semibold text-brand-navy",
        !isToday && outside && "text-subtle-foreground"
      )}
    >
      {Number(day.slice(8))}
    </span>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "min-h-16 min-w-0 border-t border-l p-1 @3xl:min-h-[118px]",
            firstColumn && "border-l-0",
            firstRow && "border-t-0",
            isWeekend(day) && "bg-muted/25",
            outside && "bg-muted/40"
          )}
        >
          {/* Estreito: o dia é um botão com um ponto por post (na cor do cliente). */}
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={posts.length === 0}
              aria-label={`${formatDayMonth(day)}: ${posts.length} ${posts.length === 1 ? "post" : "posts"}`}
              className="flex w-full flex-col items-center gap-1 rounded-md py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default @3xl:hidden"
            >
              {dayNumber}
              <span className="flex h-1.5 items-center gap-0.5">
                {posts.slice(0, VISIBLE_IN_CELL).map((post) => (
                  <span key={post.id} className={cn("size-1.5 rounded-full", attentionDot(post, today) ?? clientDotColor(post.client_id))} />
                ))}
                {hidden > 0 ? <span className="text-[9px] leading-none text-muted-foreground">+</span> : null}
              </span>
            </button>
          </PopoverTrigger>

          {/* Largo: número do dia e até três posts. */}
          <div className="hidden @3xl:block">
            <div className="px-1 pt-0.5 pb-1">{dayNumber}</div>
            <div className="space-y-px">
              {posts.slice(0, VISIBLE_IN_CELL).map((post) => (
                <PostChip key={post.id} post={post} today={today} onOpen={openPost} />
              ))}
              {hidden > 0 ? (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="w-full rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  +{hidden} {hidden === 1 ? "post" : "posts"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1.5 pt-1 pb-2 text-xs font-medium text-muted-foreground">
          {capitalize(formatWeekdayLong(day))}, {formatDayMonth(day)}
        </p>
        <div className="space-y-px">
          {posts.map((post) => (
            <PostChip key={post.id} post={post} today={today} onOpen={openPost} withTime />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Post compacto (mês e lista do dia): cliente, formato, título, etapa e o sinal de atenção. */
function PostChip({
  post,
  today,
  onOpen,
  withTime = false,
}: {
  post: PostSummary
  today: DateKey
  onOpen: (post: PostSummary) => void
  withTime?: boolean
}) {
  const { clientById } = useWorkspace()
  const attention = attentionDot(post, today)
  const text = describe(post, clientById.get(post.client_id)?.name ?? "Cliente", attention !== null)
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      title={text}
      aria-label={text}
      className="flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-muted"
    >
      <ClientMark clientId={post.client_id} size="xs" />
      <FormatIcon format={post.format} className="size-3 text-muted-foreground" />
      {withTime && post.publish_time ? <span className="shrink-0 text-muted-foreground tabular-nums">{post.publish_time.slice(0, 5)}</span> : null}
      <span className={cn("min-w-0 flex-1 truncate text-foreground", post.stage === "published" && "text-muted-foreground")}>{post.title}</span>
      <StageDot stage={post.stage} className="size-1.5" />
      {attention ? <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", attention)} /> : null}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Semana                                                              */
/* ------------------------------------------------------------------ */

/** Sete colunas quando há espaço; abaixo disso, uma lista por dia. */
function WeekGrid({
  days,
  today,
  byDay,
  onOpen,
  onCreate,
}: {
  days: DateKey[]
  today: DateKey
  byDay: Map<DateKey, PostSummary[]>
  onOpen: (post: PostSummary) => void
  onCreate: (day: DateKey) => void
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border @3xl:grid @3xl:grid-cols-7">
        {days.map((day) => (
          <div key={day} className={cn("group/day flex min-h-[420px] min-w-0 flex-col border-l first:border-l-0", isWeekend(day) && "bg-muted/30")}>
            <div className="flex h-11 items-center justify-between gap-1 border-b px-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{formatWeekdayShort(day)}</span>
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums",
                    day === today ? "bg-brand text-brand-navy" : "text-foreground"
                  )}
                >
                  {Number(day.slice(8))}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Novo post em ${formatDayMonth(day)}`}
                className="text-muted-foreground opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100"
                onClick={() => onCreate(day)}
              >
                <Plus />
              </Button>
            </div>
            <div className="flex-1 space-y-1.5 p-1.5">
              {(byDay.get(day) ?? []).map((post) => (
                <WeekCard key={post.id} post={post} today={today} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6 @3xl:hidden">
        {days.map((day) => {
          const list = byDay.get(day) ?? []
          return (
            <section key={day} aria-label={formatDayMonth(day)}>
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {capitalize(formatWeekdayLong(day))}, {formatDayMonth(day)}
                  {day === today ? <Badge className="px-2 text-[11px]">Hoje</Badge> : null}
                </h3>
                <Button variant="ghost" size="icon-xs" aria-label={`Novo post em ${formatDayMonth(day)}`} className="text-muted-foreground" onClick={() => onCreate(day)}>
                  <Plus />
                </Button>
              </div>
              {list.length === 0 ? (
                <p className="pt-2 text-[13px] text-subtle-foreground">Nenhum post.</p>
              ) : (
                <div className="-mx-3 pt-1">
                  {list.map((post) => (
                    <PostRow key={post.id} post={post} today={today} onOpen={onOpen} showFronts={false} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}

function WeekCard({ post, today, onOpen }: { post: PostSummary; today: DateKey; onOpen: (post: PostSummary) => void }) {
  const { clientById } = useWorkspace()
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="block w-full rounded-md border bg-card px-2 py-1.5 text-left text-xs shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_6px_0_rgb(0_0_0/0.08)]"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <ClientMark clientId={post.client_id} size="xs" />
        <span className="truncate text-muted-foreground">{clientById.get(post.client_id)?.name}</span>
      </span>
      <span className={cn("mt-1 line-clamp-3 leading-4 font-medium text-foreground", post.stage === "published" && "text-muted-foreground")}>
        {post.title}
      </span>
      <span className="mt-1 flex items-center gap-1 text-muted-foreground">
        <FormatIcon format={post.format} className="size-3" />
        <span className="truncate">{CONTENT_FORMAT_LABEL[post.format]}</span>
        {post.publish_time ? <span className="ml-auto shrink-0 tabular-nums">{post.publish_time.slice(0, 5)}</span> : null}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          <StageDot stage={post.stage} className="size-1.5" />
          <span className="truncate">{CONTENT_STAGE_LABEL[post.stage]}</span>
        </span>
        <PostFlags post={post} today={today} compact />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Sem data                                                            */
/* ------------------------------------------------------------------ */

function UndatedPosts({ posts, today, onOpen }: { posts: PostSummary[]; today: DateKey; onOpen: (post: PostSummary) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Posts sem data" className="mt-4 rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-foreground"
      >
        Sem data de publicação
        <span className="font-normal text-muted-foreground tabular-nums">{posts.length}</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t px-1 py-1">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} today={today} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
