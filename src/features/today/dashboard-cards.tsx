"use client"

import { ArrowRight, Plus } from "lucide-react"
import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { reviewInfo } from "@/features/docs/doc-meta"
import { needsReview } from "@/features/docs/logic"
import { addItemToOccurrence, updateMeetingItem } from "@/features/meetings/actions"
import { meetingKind, meetingsOverview, nextMeeting, recordFor, type MeetingEntry } from "@/features/meetings/logic"
import { MeetingKindBadge, dayLabel, relativeDays, timeLabel } from "@/features/meetings/meeting-meta"
import { MeetingLink } from "@/features/meetings/open-meeting"
import { ITEM_MAX } from "@/features/meetings/validation"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { DueLabel } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import type { CalendarEvent, DocSummary, MeetingItem, MeetingRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Blocos da tela Hoje que vêm das outras áreas: a próxima reunião, os
 * combinados em aberto e os processos para revisar.
 */

/** A próxima reunião, com o atalho para pôr um assunto na pauta. */
export function NextMeetingCompact({
  events,
  records,
  items,
  className,
}: {
  events: CalendarEvent[]
  records: MeetingRecord[]
  items: MeetingItem[]
  className?: string
}) {
  const { today } = useTasks()
  const { clientById } = useWorkspace()
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const entry: MeetingEntry | null = nextMeeting(
    meetingsOverview(events, records, today, { horizonDays: 14, lookbackDays: 0 })
  )
  if (!entry) return null

  const kind = meetingKind(entry.event)
  const clientName = entry.event.client_id ? (clientById.get(entry.event.client_id)?.name ?? null) : null
  const record = entry.record ?? recordFor(records, entry.event, entry.date)
  const topics = record ? items.filter((item) => item.meeting_id === record.id && item.kind === "topic").length : 0

  function addTopic() {
    const content = draft.trim()
    if (!content || !entry) return
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

  return (
    <section aria-labelledby="proxima-reuniao-hoje" className={cn("relative overflow-hidden rounded-xl border bg-card", className)}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <div className="px-4 py-3.5 pl-5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="text-brand-ink">Próxima reunião</span>
          <span aria-hidden="true">·</span>
          {relativeDays(entry.date, today)}
        </p>
        <h2 id="proxima-reuniao-hoje" className="mt-1 font-display text-[15px] leading-6 font-semibold tracking-tight text-foreground">
          {entry.event.title}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {dayLabel(entry.date, today)} · {timeLabel(entry)}
          </span>
          <MeetingKindBadge kind={kind} clientName={clientName} />
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {topics === 0 ? "Nenhum assunto na pauta ainda." : `${topics} ${topics === 1 ? "assunto" : "assuntos"} na pauta.`}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            addTopic()
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={ITEM_MAX}
            placeholder="Algo para discutir?"
            aria-label="Adicionar assunto à pauta da próxima reunião"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            aria-label="Adicionar assunto"
            disabled={!draft.trim() || isPending}
            className="size-8 shadow-none"
          >
            <Plus />
          </Button>
        </form>
        <MeetingLink
          meetingId={record?.id ?? null}
          eventId={entry.event.id}
          date={entry.date}
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:text-brand-ink"
        >
          Abrir pauta
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </MeetingLink>
      </div>
    </section>
  )
}

/**
 * Combinados de reunião ainda abertos que não viraram tarefa (os que viraram
 * já aparecem nas listas de tarefas).
 */
export function OpenAgreements({
  items,
  records,
  events,
  scope,
  className,
}: {
  items: MeetingItem[]
  records: MeetingRecord[]
  events: CalendarEvent[]
  scope: "mine" | "all"
  className?: string
}) {
  const { today } = useTasks()
  const { currentUser, profileById } = useWorkspace()
  const [, startTransition] = useTransition()
  const [optimistic, markDone] = useOptimistic(items, (current: MeetingItem[], id: string) =>
    current.map((item) => (item.id === id ? { ...item, done: true } : item))
  )
  const recordById = new Map(records.map((record) => [record.id, record]))
  const eventById = new Map(events.map((event) => [event.id, event]))

  const open = optimistic
    .filter(
      (item) =>
        item.kind === "agreement" &&
        !item.task_id &&
        (scope === "all" || item.owner_id === currentUser.id || item.owner_id === null)
    )
    .sort((a, b) => {
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : 1
      }
      return a.created_at < b.created_at ? -1 : 1
    })
  const pending = open.filter((item) => !item.done)
  if (pending.length === 0) return null

  function complete(item: MeetingItem) {
    startTransition(async () => {
      markDone(item.id)
      const result = await updateMeetingItem(item.id, { done: true })
      if (result.ok) toast.success("Combinado cumprido", { description: item.content })
      else toast.error(result.error)
    })
  }

  return (
    <section aria-labelledby="combinados-hoje" className={className}>
      <div className="flex h-8 items-center gap-2 border-b border-border/80">
        <h2 id="combinados-hoje" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Combinados em aberto
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{pending.length}</span>
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">das reuniões</span>
      </div>
      <ul className="mt-1">
        {pending.map((item) => {
          const record = recordById.get(item.meeting_id)
          const event = record ? eventById.get(record.event_id) : undefined
          const owner = item.owner_id ? profileById.get(item.owner_id) : undefined
          return (
            <li key={item.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 hover:bg-muted/50">
              <TaskCheckbox
                checked={item.done}
                onCheckedChange={() => complete(item)}
                aria-label={`Marcar como cumprido: ${item.content}`}
                className="mt-[1px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5 text-foreground">{item.content}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
                  {record ? (
                    <Link href={`/reunioes/${record.id}`} className="hover:text-foreground hover:underline">
                      {event?.title ?? "Reunião"} · {formatShortDate(record.occurs_on, today)}
                    </Link>
                  ) : null}
                  {scope === "all" ? (
                    <>
                      <span aria-hidden="true" className="text-subtle-foreground">·</span>
                      {owner ? owner.full_name.split(" ")[0] : "Equipe"}
                    </>
                  ) : null}
                </span>
              </span>
              {item.due_date ? <DueLabel due={item.due_date} today={today} className="shrink-0 pt-px text-[13px]" /> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Processos com a revisão vencida (ou marcados para revisar). */
export function DocsToReview({
  docs,
  scope,
  className,
}: {
  docs: DocSummary[]
  scope: "mine" | "all"
  className?: string
}) {
  const { today } = useTasks()
  const { currentUser } = useWorkspace()
  const list = docs.filter(
    (doc) => needsReview(doc, today) && (scope === "all" || doc.owner_id === currentUser.id || doc.owner_id === null)
  )
  if (list.length === 0) return null

  return (
    <section aria-labelledby="processos-revisar" className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
        <h2 id="processos-revisar" className="text-sm font-semibold text-foreground">
          Processos para revisar
        </h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{list.length}</span>
      </header>
      <ul className="px-1 pb-2">
        {list.slice(0, 5).map((doc) => (
          <li key={doc.id}>
            <Link href={`/processos/${doc.id}`} className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60">
              <span className="block truncate text-sm font-medium text-foreground">{doc.title}</span>
              <span className="block text-xs text-amber-800">
                {doc.status === "review" ? "Marcado para revisar" : reviewInfo(doc, today).label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > 5 ? (
        <Link href="/processos?ver=revisar" className="block px-4 pb-3 text-xs font-medium text-muted-foreground hover:text-foreground">
          Ver todos ({list.length})
        </Link>
      ) : null}
    </section>
  )
}
