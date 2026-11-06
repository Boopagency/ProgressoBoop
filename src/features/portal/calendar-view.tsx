import { CalendarDays, ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer } from "@/components/layout/page"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { groupByDay } from "@/features/content/logic"
import { PORTAL_STATUS_LABEL, portalStatus, type PortalPost, type PortalStatus } from "@/features/portal/content-logic"
import { PostListItem, StatusDot } from "@/features/portal/post-meta"
import { PortalEmpty, PortalHeader } from "@/features/portal/portal-ui"
import {
  addMonthsToKey,
  eachDayKey,
  formatMonthYear,
  formatWeekdayShort,
  isWithin,
  monthGridRangeOf,
  monthRangeOf,
} from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const

/** A legenda, na ordem em que o post anda. */
const LEGEND: PortalStatus[] = ["review", "adjusting", "approved", "scheduled", "published"]
const LEGEND_STAGE = {
  review: "client_review",
  adjusting: "production",
  approved: "approved",
  scheduled: "scheduled",
  published: "published",
} as const

export interface PortalCalendarData {
  clientName: string
  /** Primeiro dia do mês mostrado. */
  anchor: DateKey
  today: DateKey
  posts: PortalPost[]
  postHref: (id: string) => string
  monthHref: (key: DateKey) => string
}

/**
 * Calendário do portal: o mês de segunda a domingo com os posts em cada dia
 * (o ponto da situação e o título), as setas e "Hoje"; no celular, só os
 * dias com post, em lista. Os sem data ficam abaixo.
 */
export function PortalCalendarView({ clientName, anchor, today, posts, postHref, monthHref }: PortalCalendarData) {
  const month = monthRangeOf(anchor)
  const days = eachDayKey(monthGridRangeOf(anchor))
  const byDay = groupByDay(posts)
  const monthDays = days.filter((day) => isWithin(day, month) && byDay.has(day))
  const undated = posts.filter((post) => post.publish_on === null && post.stage !== "published")
  const inMonth = monthDays.reduce((total, day) => total + (byDay.get(day)?.length ?? 0), 0)
  const toReview = posts.filter((post) => portalStatus(post.stage) === "review").length
  const monthName = formatMonthYear(anchor).split(" de ")[0]?.toLocaleLowerCase("pt-BR") ?? ""
  const otherYear = anchor.slice(0, 4) !== today.slice(0, 4)

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Calendário de <em>{monthName}</em>
            {otherYear ? ` ${anchor.slice(0, 4)}` : null}
          </>
        }
        description="Os posts do mês, dia a dia. Toque num post para ver, aprovar ou conversar sobre ele."
        stats={[
          { label: "No mês", value: inMonth },
          { label: "Para aprovar", value: toReview },
        ]}
      />

      {/* A mesma ordem do Calendário do admin: setas, o mês e "Hoje"; a legenda à direita. */}
      <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex items-center gap-1 rounded-full border bg-card p-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={monthHref(addMonthsToKey(anchor, -1))} aria-label="Mês anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-36 px-1 text-center text-sm font-semibold tracking-tight text-foreground tabular-nums">
            {formatMonthYear(anchor)}
          </h2>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={monthHref(addMonthsToKey(anchor, 1))} aria-label="Próximo mês">
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {anchor.slice(0, 7) !== today.slice(0, 7) ? (
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(today)}>Hoje</Link>
          </Button>
        ) : null}
        <ul aria-label="Legenda" className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
          {LEGEND.map((status) => (
            <li
              key={status}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-foreground/12 px-2.5 text-xs text-muted-foreground"
            >
              <StatusDot stage={LEGEND_STAGE[status]} />
              {PORTAL_STATUS_LABEL[status]}
            </li>
          ))}
        </ul>
      </div>

      {/* A chave por mês faz o corpo entrar de novo (como ao abrir a tela) a cada troca de mês. */}
      <PageBody key={anchor.slice(0, 7)}>
        {/* Do md para cima: o mês em grade, de segunda a domingo. */}
        <div className="hidden overflow-hidden rounded-[1.75rem] border bg-card md:block">
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((label) => (
              <div key={label} className="px-3 py-2.5 eyebrow text-[10.5px] text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const list = byDay.get(day) ?? []
              const current = isWithin(day, month)
              const isToday = day === today
              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-28 border-r border-b p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
                    !current && "bg-muted/40",
                    isToday && "bg-glow-soft/60"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums",
                      current ? "text-foreground" : "text-subtle-foreground",
                      isToday && "bg-primary font-semibold text-primary-foreground shadow-glow"
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {isToday ? <span className="sr-only"> (hoje)</span> : null}
                  <ul className="mt-1.5 space-y-1">
                    {list.map((post) => (
                      <li key={post.id}>
                        <Link
                          href={postHref(post.id)}
                          title={`${post.title} · ${PORTAL_STATUS_LABEL[portalStatus(post.stage)]}`}
                          className="flex items-center gap-1.5 rounded-lg border border-transparent bg-muted/70 px-1.5 py-1 text-xs text-foreground outline-none transition-colors hover:border-glow/30 hover:bg-glow-soft focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        >
                          <StatusDot stage={post.stage} />
                          <span className="truncate">{post.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>

        {/* Celular: só os dias do mês que têm post, em lista, com o dia grande ao lado. */}
        <div className="space-y-5 md:hidden">
          {monthDays.length === 0 ? (
            <PortalEmpty icon={CalendarDays} title="Nenhum post neste mês">
              Quando a equipe programar posts para {monthName}, eles aparecem aqui, dia a dia.
            </PortalEmpty>
          ) : (
            monthDays.map((day) => (
              <section key={day} aria-label={`${formatWeekdayShort(day)}, ${day.slice(8)}`} className="flex gap-3">
                <div className={cn("w-11 shrink-0 pt-1.5 text-center", day === today ? "text-brand-ink" : "text-foreground")}>
                  <p className={cn("eyebrow text-[10px]", day === today ? "text-brand-ink" : "text-muted-foreground")}>
                    {day === today ? "Hoje" : formatWeekdayShort(day)}
                  </p>
                  <p className="mt-1 display-number text-[34px] leading-none">{day.slice(8)}</p>
                </div>
                <ul className={cn("min-w-0 flex-1 rounded-2xl border bg-card p-1.5", day === today && "border-glow/40")}>
                  {(byDay.get(day) ?? []).map((post) => (
                    <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} meta="time" />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {undated.length > 0 ? (
          <PanelCard id="sem-data" title={<>Sem data <PanelCount value={undated.length} /></>}>
            <ul className="p-1.5">
              {undated.map((post) => (
                <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
              ))}
            </ul>
          </PanelCard>
        ) : null}

        {posts.length === 0 ? (
          <PortalEmpty icon={CalendarX2} title="O calendário ainda está vazio" className="max-md:hidden">
            Quando a equipe enviar os primeiros posts, eles aparecem nos dias em que vão ao ar.
          </PortalEmpty>
        ) : null}
      </PageBody>
    </PageContainer>
  )
}
