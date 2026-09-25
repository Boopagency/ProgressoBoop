import { ArrowUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { describeDue, formatShortDate, toDateKey, type DueTone } from "@/lib/dates"
import { TASK_STATUS_LABEL } from "@/lib/labels"
import type { DateKey, Task, TaskStatus } from "@/lib/types"
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
  className,
}: {
  due: DateKey | null
  today: DateKey
  className?: string
}) {
  const { label, tone } = describeDue(due, today)
  return (
    <span
      className={cn("text-[13px] whitespace-nowrap tabular-nums", DUE_TONE_CLASS[tone], className)}
    >
      {label}
    </span>
  )
}

/** Prazo da tarefa aberta, ou "Concluída 24/09" quando já foi feita. */
export function TaskDateLabel({
  task,
  today,
  className,
}: {
  task: Pick<Task, "status" | "due_date" | "completed_at">
  today: DateKey
  className?: string
}) {
  if (task.status === "done" && task.completed_at) {
    return (
      <span
        className={cn(
          "text-[13px] whitespace-nowrap text-subtle-foreground tabular-nums",
          className
        )}
      >
        Concluída {formatShortDate(toDateKey(task.completed_at), today)}
      </span>
    )
  }
  return <DueLabel due={task.due_date} today={today} className={className} />
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
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-amber-600/15 bg-amber-50 px-2 text-[11px] leading-4 text-amber-800",
        className
      )}
    >
      <StatusDot status="doing" className="size-1.5" />
      {TASK_STATUS_LABEL.doing}
    </Badge>
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
