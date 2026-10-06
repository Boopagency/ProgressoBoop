import { Building2, Repeat } from "lucide-react"

import { MEETING_KIND_LABEL, type MeetingEntry, type MeetingKind } from "@/features/meetings/logic"
import {
  addDaysToKey,
  capitalize,
  daysBetween,
  formatShortDate,
  formatWeekdayShort,
} from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_STYLE: Record<MeetingKind, string> = {
  weekly: "bg-brand-soft text-brand-ink",
  client: "bg-brand-sand text-foreground",
  internal: "bg-brand-mist/70 text-brand-navy",
}

/** "Weekly", "Velmont" (reunião com cliente) ou "Interna". */
export function MeetingKindBadge({
  kind,
  clientName,
  className,
}: {
  kind: MeetingKind
  clientName?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] leading-none font-medium whitespace-nowrap",
        KIND_STYLE[kind],
        className
      )}
    >
      {kind === "client" ? <Building2 className="size-3" aria-hidden="true" /> : null}
      {kind === "weekly" ? <Repeat className="size-3" aria-hidden="true" /> : null}
      {kind === "client" && clientName ? clientName : MEETING_KIND_LABEL[kind]}
    </span>
  )
}

export type EntryState = "upcoming" | "open" | "done" | "canceled" | "unrecorded"

/** Situação da reunião na lista. */
export function entryState(entry: MeetingEntry, today: DateKey): EntryState {
  const { record } = entry
  if (!record) return entry.date < today ? "unrecorded" : "upcoming"
  if (record.status === "done") return "done"
  if (record.status === "canceled") return "canceled"
  return entry.date < today ? "open" : "upcoming"
}

const STATE_LABEL: Record<EntryState, string> = {
  upcoming: "Agendada",
  open: "Em aberto",
  done: "Encerrada",
  canceled: "Cancelada",
  unrecorded: "Sem registro",
}

const STATE_STYLE: Record<EntryState, string> = {
  upcoming: "border-border text-muted-foreground",
  open: "border-amber-600/20 bg-amber-50 text-amber-800",
  done: "border-success/25 bg-success/10 text-[oklch(0.42_0.1_158)]",
  canceled: "border-border bg-muted text-muted-foreground line-through decoration-muted-foreground/50",
  unrecorded: "border-dashed border-border text-subtle-foreground",
}

export function EntryStateBadge({ state, className }: { state: EntryState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11.5px] leading-none font-medium whitespace-nowrap",
        STATE_STYLE[state],
        className
      )}
    >
      {STATE_LABEL[state]}
    </span>
  )
}

/** "Hoje", "Amanhã", "Ontem" ou "Seg, 12/10". */
export function dayLabel(date: DateKey, today: DateKey): string {
  if (date === today) return "Hoje"
  if (date === addDaysToKey(today, 1)) return "Amanhã"
  if (date === addDaysToKey(today, -1)) return "Ontem"
  return `${capitalize(formatWeekdayShort(date))}, ${formatShortDate(date, today)}`
}

/** "07:00–08:00", "07:00" ou "Dia inteiro". */
export function timeLabel(entry: Pick<MeetingEntry, "startTime" | "endTime">): string {
  if (!entry.startTime) return "Dia inteiro"
  return entry.endTime ? `${entry.startTime}–${entry.endTime}` : entry.startTime
}

/** "em 6 dias", "amanhã", "hoje", "há 3 dias". */
export function relativeDays(date: DateKey, today: DateKey): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return "hoje"
  if (diff === 1) return "amanhã"
  if (diff === -1) return "ontem"
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`
}
