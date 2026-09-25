import { ArrowUp } from "lucide-react"

import { describeDue, type DueTone } from "@/lib/dates"
import { TASK_STATUS_LABEL } from "@/lib/labels"
import type { DateKey, TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "font-medium text-overdue",
  today: "font-medium text-foreground",
  soon: "text-foreground",
  future: "text-muted-foreground",
  none: "text-subtle-foreground",
}

/** Prazo em linguagem natural, colorido quando atrasado. */
export function DueLabel({
  due,
  today,
  muted = false,
  className,
}: {
  due: DateKey | null
  today: DateKey
  /** Tarefa concluída: prazo sem destaque. */
  muted?: boolean
  className?: string
}) {
  const { label, tone } = describeDue(due, today)
  return (
    <span
      className={cn(
        "text-[13px] whitespace-nowrap tabular-nums",
        muted ? "text-subtle-foreground" : DUE_TONE_CLASS[tone],
        className
      )}
    >
      {label}
    </span>
  )
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/40",
  doing: "bg-warning",
  done: "bg-success",
}

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)}
    />
  )
}

/** Selo discreto para tarefas em andamento. */
export function DoingPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] leading-4 font-medium text-amber-800 ring-1 ring-amber-600/15 ring-inset",
        className
      )}
    >
      <StatusDot status="doing" className="size-1.5" />
      {TASK_STATUS_LABEL.doing}
    </span>
  )
}

export function HighPriorityIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 text-orange-600", className)} title="Prioridade alta">
      <ArrowUp className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">Prioridade alta</span>
    </span>
  )
}
