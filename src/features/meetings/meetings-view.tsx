"use client"

import { ArrowRight, CalendarPlus, FileText, Plus, Search, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer, PageHeader, SectionTitle } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { EventDialog, type EventDialogState } from "@/features/calendar/event-dialog"
import { WEEKLY } from "@/features/calendar/recurrence"
import { addItemToOccurrence } from "@/features/meetings/actions"
import {
  agreementStatus,
  meetingKind,
  nextMeeting,
  previousRecords,
  type MeetingEntry,
  type MeetingKind,
  type MeetingsOverview,
} from "@/features/meetings/logic"
import {
  EntryStateBadge,
  MeetingKindBadge,
  dayLabel,
  entryState,
  relativeDays,
  timeLabel,
} from "@/features/meetings/meeting-meta"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { ITEM_MAX } from "@/features/meetings/validation"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatMonthYear, formatWeekdayShort, parseDateKey } from "@/lib/dates"
import { includesText } from "@/lib/text"
import type { CalendarEvent, DateKey, MeetingItem, MeetingRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

type KindFilter = "all" | MeetingKind

const KIND_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "weekly", label: "Weekly" },
  { value: "client", label: "Clientes" },
  { value: "internal", label: "Internas" },
] as const

const KIND_PARAM: Record<Exclude<KindFilter, "all">, string> = {
  weekly: "weekly",
  client: "clientes",
  internal: "internas",
}

function parseKind(value: string | null): KindFilter {
  const found = Object.entries(KIND_PARAM).find(([, param]) => param === value)
  return found ? (found[0] as MeetingKind) : "all"
}

export function MeetingsView({
  overview,
  events,
  records,
  items,
  query,
  searchHits,
}: {
  overview: MeetingsOverview
  events: CalendarEvent[]
  records: MeetingRecord[]
  items: MeetingItem[]
  /** Busca atual (?q=). */
  query: string
  /** Reuniões cujo resumo ou transcrição batem com a busca. */
  searchHits: string[]
}) {
  const { today } = useTasks()
  const { clientById } = useWorkspace()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const kind = parseKind(searchParams.get("tipo"))
  const [draft, setDraft] = useState(query)
  const [isSearching, startSearch] = useTransition()
  const [dialog, setDialog] = useState<EventDialogState>({ open: false, key: 0, mode: "meeting" })

  function urlWith(next: { kind?: KindFilter; query?: string }) {
    const params = new URLSearchParams()
    const nextKind = next.kind ?? kind
    const nextQuery = (next.query ?? query).trim()
    if (nextKind !== "all") params.set("tipo", KIND_PARAM[nextKind])
    if (nextQuery) params.set("q", nextQuery)
    const search = params.toString()
    return search ? `${pathname}?${search}` : pathname
  }

  function changeKind(next: KindFilter) {
    window.history.replaceState(null, "", urlWith({ kind: next }))
  }

  function search(next: string) {
    startSearch(() => router.replace(urlWith({ query: next }), { scroll: false }))
  }

  const itemsByMeeting = new Map<string, MeetingItem[]>()
  for (const item of items) {
    const list = itemsByMeeting.get(item.meeting_id) ?? []
    list.push(item)
    itemsByMeeting.set(item.meeting_id, list)
  }
  const hits = new Set(searchHits)
  const searching = query.trim().length > 0

  function matchesKind(entry: MeetingEntry) {
    return kind === "all" || meetingKind(entry.event) === kind
  }

  /** Onde a busca encontrou: título, cliente, assunto/combinado ou texto da reunião. */
  function matchOf(entry: MeetingEntry): string | null {
    if (!searching) return null
    const clientName = entry.event.client_id ? clientById.get(entry.event.client_id)?.name : null
    if (includesText(entry.event.title, query) || (clientName && includesText(clientName, query))) {
      return ""
    }
    const item = entry.record
      ? itemsByMeeting.get(entry.record.id)?.find((candidate) => includesText(candidate.content, query))
      : undefined
    if (item) return `${item.kind === "topic" ? "Assunto" : "Combinado"}: ${item.content}`
    if (entry.record && hits.has(entry.record.id)) return "Encontrado no resumo ou na transcrição"
    return null
  }

  const upcoming = overview.upcoming.filter(matchesKind)
  const history = overview.history.filter(matchesKind)
  const next = searching ? null : nextMeeting({ upcoming, history })
  // Reunião semanal aparece uma vez só (a próxima); as outras semanas só se
  // já tiverem registro (um assunto adicionado com antecedência, por exemplo).
  const seenSeries = new Set(next?.event.recurrence_rule === WEEKLY ? [next.event.id] : [])
  const visibleUpcoming = (searching ? upcoming.filter((entry) => matchOf(entry) !== null) : upcoming).filter(
    (entry) => {
      if (entry === next) return false
      if (entry.event.recurrence_rule !== WEEKLY) return true
      const seen = seenSeries.has(entry.event.id)
      seenSeries.add(entry.event.id)
      return !seen || entry.record !== null
    }
  )
  const visibleHistory = searching ? history.filter((entry) => matchOf(entry) !== null) : history
  const months = groupByMonth(visibleHistory)
  const nothingAtAll = overview.upcoming.length === 0 && overview.history.length === 0

  return (
    <PageContainer className="max-w-[1080px]">
      <PageHeader
        title="Reuniões"
        description="Weeklies e reuniões com clientes: pauta, combinados e transcrição."
        actions={
          <Button
            onClick={() =>
              setDialog((current) => ({ open: true, key: current.key + 1, mode: "meeting" }))
            }
            className="gap-1.5"
          >
            <CalendarPlus />
            Nova reunião
          </Button>
        }
      />

      {next ? (
        <NextMeetingCard
          entry={next}
          events={events}
          records={records}
          items={items}
          className="mt-8"
        />
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          role="search"
          className="relative w-full sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            search(draft)
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (event.target.value === "" && query) search("")
            }}
            placeholder="Buscar em reuniões e transcrições"
            aria-label="Buscar reuniões"
            className="h-9 w-full rounded-lg border border-input bg-background pr-9 pl-9 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {draft ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setDraft("")
                search("")
              }}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-content-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </form>
        <SegmentedControl
          aria-label="Tipo de reunião"
          value={kind}
          onValueChange={changeKind}
          options={KIND_OPTIONS}
        />
      </div>

      {searching ? (
        <p className={cn("mt-4 text-[13px] text-muted-foreground", isSearching && "opacity-60")} aria-live="polite">
          {visibleUpcoming.length + visibleHistory.length === 0
            ? `Nada encontrado para “${query}”.`
            : `Resultados para “${query}”`}
        </p>
      ) : null}

      {nothingAtAll ? (
        <div className="mt-10 rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma reunião por enquanto</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Crie uma reunião aqui ou marque um evento do tipo “Reunião” no Calendário.
          </p>
        </div>
      ) : null}

      <div className={cn("space-y-10", isSearching && "opacity-60 transition-opacity")}>
        {visibleUpcoming.length > 0 ? (
          <section aria-labelledby="proximas" className="mt-8">
            <SectionTitle id="proximas" count={visibleUpcoming.length}>
              {next ? "Depois dessa" : "Próximas"}
            </SectionTitle>
            <ul className="mt-2 -mx-3">
              {visibleUpcoming.map((entry) => (
                <MeetingRow
                  key={entry.key}
                  entry={entry}
                  items={entry.record ? (itemsByMeeting.get(entry.record.id) ?? []) : []}
                  match={matchOf(entry)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {months.map(([month, entries]) => (
          <section key={month} aria-label={formatMonthYear(`${month}-01`)} className="mt-8">
            <SectionTitle count={entries.length}>{formatMonthYear(`${month}-01`)}</SectionTitle>
            <ul className="mt-2 -mx-3">
              {entries.map((entry) => (
                <MeetingRow
                  key={entry.key}
                  entry={entry}
                  items={entry.record ? (itemsByMeeting.get(entry.record.id) ?? []) : []}
                  match={matchOf(entry)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <EventDialog
        state={dialog}
        today={today}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </PageContainer>
  )
}

function groupByMonth(entries: MeetingEntry[]): [string, MeetingEntry[]][] {
  const groups = new Map<string, MeetingEntry[]>()
  for (const entry of entries) {
    const month = entry.date.slice(0, 7)
    const list = groups.get(month) ?? []
    list.push(entry)
    groups.set(month, list)
  }
  return [...groups.entries()]
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function DateTile({ date, today }: { date: DateKey; today: DateKey }) {
  const day = parseDateKey(date)
  const isToday = date === today
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 leading-none",
        isToday ? "border-brand bg-brand-soft" : "bg-background"
      )}
    >
      <span className="text-[10.5px] font-medium text-muted-foreground uppercase">
        {MONTH_SHORT[day.getMonth()]}
      </span>
      <span className="mt-0.5 font-display text-[17px] font-semibold text-foreground tabular-nums">
        {day.getDate()}
      </span>
      <span className="mt-0.5 text-[10.5px] text-muted-foreground">{formatWeekdayShort(date)}</span>
    </span>
  )
}

function MeetingRow({
  entry,
  items,
  match,
}: {
  entry: MeetingEntry
  items: MeetingItem[]
  match: string | null
}) {
  const { tasks, today } = useTasks()
  const { clientById } = useWorkspace()
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const kind = meetingKind(entry.event)
  const clientName = entry.event.client_id ? (clientById.get(entry.event.client_id)?.name ?? null) : null
  const state = entryState(entry, today)
  const agreements = items.filter((item) => item.kind === "agreement")
  const openAgreements = agreements.filter((item) => agreementStatus(item, taskById) !== "done").length
  const topics = items.filter((item) => item.kind === "topic").length

  const details = [
    timeLabel(entry),
    agreements.length > 0
      ? `${agreements.length} ${agreements.length === 1 ? "combinado" : "combinados"}${openAgreements > 0 ? ` (${openAgreements} em aberto)` : ""}`
      : null,
    topics > 0 && state !== "done" ? `${topics} ${topics === 1 ? "assunto" : "assuntos"}` : null,
  ].filter(Boolean)

  return (
    <li>
      <MeetingLink
        meetingId={entry.record?.id ?? null}
        eventId={entry.event.id}
        date={entry.date}
        className={cn(
          "flex w-full items-center gap-4 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40",
          state === "canceled" && "opacity-70"
        )}
      >
        <DateTile date={entry.date} today={today} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium text-foreground",
                state === "canceled" && "line-through decoration-muted-foreground/50"
              )}
            >
              {entry.event.title}
            </span>
            <MeetingKindBadge kind={kind} clientName={clientName} className="hidden sm:inline-flex" />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground tabular-nums">
            {details.map((part, index) => (
              <span key={index} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true" className="text-subtle-foreground">·</span> : null}
                {part}
              </span>
            ))}
            {entry.record && entry.record.transcript_length > 0 ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-subtle-foreground">·</span>
                <FileText className="size-3.5" aria-hidden="true" />
                Transcrição
              </span>
            ) : null}
          </span>
          {match ? (
            <span className="mt-1 line-clamp-1 text-[13px] text-foreground/80">{match}</span>
          ) : null}
        </span>
        {state === "upcoming" ? null : (
          <EntryStateBadge state={state} className="hidden sm:inline-flex" />
        )}
      </MeetingLink>
    </li>
  )
}

function NextMeetingCard({
  entry,
  events,
  records,
  items,
  className,
}: {
  entry: MeetingEntry
  events: CalendarEvent[]
  records: MeetingRecord[]
  items: MeetingItem[]
  className?: string
}) {
  const { tasks, today } = useTasks()
  const { clientById } = useWorkspace()
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const kind = meetingKind(entry.event)
  const clientName = entry.event.client_id ? (clientById.get(entry.event.client_id)?.name ?? null) : null

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const eventById = new Map(events.map((event) => [event.id, event]))
  const previous = previousRecords(entry.event, entry.date, records, eventById)
  const previousIds = new Set(previous.map((candidate) => candidate.record.id))
  const openAgreements = items.filter(
    (item) =>
      item.kind === "agreement" &&
      previousIds.has(item.meeting_id) &&
      agreementStatus(item, taskById) !== "done"
  ).length
  const topics = entry.record
    ? items.filter((item) => item.meeting_id === entry.record?.id && item.kind === "topic").length
    : 0

  function addTopic() {
    const content = draft.trim()
    if (!content) return
    startTransition(async () => {
      const result = await addItemToOccurrence(entry.event.id, entry.date, {
        kind: "topic",
        content,
        owner_id: null,
        due_date: null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDraft("")
      toast.success("Assunto adicionado à pauta", { description: content })
    })
  }

  const facts = [
    topics === 0
      ? "Nenhum assunto na pauta ainda"
      : `${topics} ${topics === 1 ? "assunto" : "assuntos"} na pauta`,
    openAgreements > 0
      ? `${openAgreements} ${openAgreements === 1 ? "combinado anterior em aberto" : "combinados anteriores em aberto"}`
      : null,
  ].filter(Boolean)

  return (
    <section
      aria-labelledby="proxima-reuniao"
      className={cn("relative overflow-hidden rounded-xl border bg-card", className)}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <div className="grid gap-5 px-5 py-5 pl-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-end">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="text-brand-ink">Próxima reunião</span>
            <span aria-hidden="true">·</span>
            <span>{relativeDays(entry.date, today)}</span>
          </p>
          <h2
            id="proxima-reuniao"
            className="mt-1.5 font-display text-xl leading-7 font-semibold tracking-tight text-foreground"
          >
            {entry.event.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {dayLabel(entry.date, today)} · <span className="tabular-nums">{timeLabel(entry)}</span>
            </span>
            <MeetingKindBadge kind={kind} clientName={clientName} />
          </p>
          <p className="mt-3 text-[13px] text-muted-foreground">{facts.join(" · ")}</p>
          <MeetingLink
            meetingId={entry.record?.id ?? null}
            eventId={entry.event.id}
            date={entry.date}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Abrir pauta
            <ArrowRight className="size-4" aria-hidden="true" />
          </MeetingLink>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            addTopic()
          }}
          className="min-w-0"
        >
          <label htmlFor="novo-assunto-proxima" className="text-xs font-medium text-muted-foreground">
            Algo para discutir?
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="novo-assunto-proxima"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={ITEM_MAX}
              placeholder="Adicionar assunto à pauta"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label="Adicionar assunto"
              disabled={!draft.trim() || isPending}
              className="shadow-none"
            >
              <Plus />
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
