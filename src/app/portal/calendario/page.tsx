import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { groupByDay } from "@/features/content/logic"
import { getPortalPosts } from "@/features/portal/content-queries"
import { PortalNav, portalHref } from "@/features/portal/portal-nav"
import { PostListItem, StatusDot } from "@/features/portal/post-meta"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import {
  addMonthsToKey,
  capitalize,
  eachDayKey,
  formatDayMonth,
  formatMonthYear,
  formatWeekdayShort,
  isDateKey,
  isWithin,
  monthGridRangeOf,
  monthRangeOf,
  todayKey,
} from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Calendário" }

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const

/** Mês pedido em `?mes=aaaa-mm`; sem ele (ou inválido), o mês de hoje. */
function monthAnchor(requested: unknown, today: DateKey): DateKey {
  const key = typeof requested === "string" ? `${requested}-01` : null
  return key && isDateKey(key) ? key : `${today.slice(0, 7)}-01`
}

/** Calendário do mês com os posts do cliente que já chegaram a ele. */
export default async function PortalCalendarPage(props: PageProps<"/portal/calendario">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const today = todayKey()
  const anchor = monthAnchor(searchParams.mes, today)
  const posts = await getPortalPosts(client.id)

  const month = monthRangeOf(anchor)
  const days = eachDayKey(monthGridRangeOf(anchor))
  const byDay = groupByDay(posts)
  const monthDays = days.filter((day) => isWithin(day, month) && byDay.has(day))
  const undated = posts.filter((post) => post.publish_on === null && post.stage !== "published")

  const href = (path: string, extra = "") => portalHref(path, client, user.clients, extra)
  const postHref = (id: string) => href(`/portal/posts/${id}`)
  const monthHref = (key: DateKey) => href("/portal/calendario", `mes=${key.slice(0, 7)}`)

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">{client.name}</h1>
      <PortalNav section="calendario" client={client} clients={user.clients} />

      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-foreground">{formatMonthYear(anchor)}</h2>
        <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 text-[13px]">
          <Link href={monthHref(today)}>Hoje</Link>
        </Button>
        <Button asChild variant="outline" size="icon" className="size-8">
          <Link href={monthHref(addMonthsToKey(anchor, -1))} aria-label="Mês anterior">
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" className="size-8">
          <Link href={monthHref(addMonthsToKey(anchor, 1))} aria-label="Próximo mês">
            <ChevronRight />
          </Link>
        </Button>
      </div>

      {/* Telas largas: o mês em grade, de segunda a domingo. */}
      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((label) => (
            <div key={label} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = byDay.get(day) ?? []
            const inMonth = isWithin(day, month)
            return (
              <div
                key={day}
                className={cn("min-h-24 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-muted/30")}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    inMonth ? "text-foreground" : "text-subtle-foreground",
                    day === today && "bg-brand font-semibold text-brand-navy"
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                <ul className="mt-1 space-y-1">
                  {list.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={postHref(post.id)}
                        title={post.title}
                        className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
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

      {/* Celular: só os dias do mês que têm post, em lista. */}
      <div className="space-y-4 sm:hidden">
        {monthDays.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-5 text-[13px] text-muted-foreground">
            Nenhum post neste mês.
          </p>
        ) : (
          monthDays.map((day) => (
            <section key={day} className="space-y-1.5">
              <h3 className={cn("text-[13px] font-medium text-muted-foreground", day === today && "text-brand-ink")}>
                {capitalize(formatWeekdayShort(day))}, {formatDayMonth(day)}
              </h3>
              <ul className="rounded-xl border bg-card p-1.5">
                {(byDay.get(day) ?? []).map((post) => (
                  <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {undated.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold text-foreground">Sem data</h3>
          <ul className="rounded-xl border bg-card p-1.5">
            {undated.map((post) => (
              <PostListItem key={post.id} post={post} href={postHref(post.id)} today={today} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
