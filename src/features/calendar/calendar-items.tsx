"use client"

import { Repeat } from "lucide-react"

import { EVENT_TYPE_STYLE, EventTypeDot } from "@/features/calendar/event-type"
import type { Occurrence } from "@/features/calendar/recurrence"
import { assigneesLabel, isDone } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

function timeRange(occurrence: Occurrence): string {
  if (!occurrence.startTime) return "Dia inteiro"
  return occurrence.endTime ? `${occurrence.startTime}–${occurrence.endTime}` : occurrence.startTime
}

/** Evento no calendário: bloco colorido (semana) ou linha compacta (mês). */
export function EventItem({
  occurrence,
  onOpen,
  compact = false,
}: {
  occurrence: Occurrence
  onOpen: (occurrence: Occurrence) => void
  compact?: boolean
}) {
  const { event } = occurrence

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(occurrence)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-muted"
      >
        <EventTypeDot type={event.event_type} className="size-1.5" />
        {occurrence.startTime ? (
          <span className="shrink-0 text-muted-foreground tabular-nums">{occurrence.startTime}</span>
        ) : null}
        <span className="truncate text-foreground">{event.title}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(occurrence)}
      className={cn(
        "block w-full rounded-md border-l-2 px-2 py-1.5 text-left text-xs transition-colors",
        EVENT_TYPE_STYLE[event.event_type].block
      )}
    >
      <span className="flex items-center gap-1 opacity-75 tabular-nums">
        {timeRange(occurrence)}
        {event.recurrence ? <Repeat className="size-3" aria-label="Recorrente" /> : null}
      </span>
      <span className="mt-0.5 line-clamp-3 leading-4 font-medium">{event.title}</span>
    </button>
  )
}

/** Tarefa com prazo no calendário. No modo completo dá para concluir ali mesmo. */
export function TaskItem({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { toggleDone, openTask } = useTasks()
  const { profiles } = useWorkspace()
  const done = isDone(task)

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full border border-muted-foreground/50",
            done && "border-success bg-success"
          )}
        />
        <span
          className={cn(
            "truncate text-foreground",
            done && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}
        >
          {task.title}
        </span>
      </button>
    )
  }

  return (
    <div className="relative flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
      <TaskCheckbox
        size="sm"
        checked={done}
        onCheckedChange={() => toggleDone(task)}
        aria-label={done ? `Reabrir "${task.title}"` : `Concluir "${task.title}"`}
        className="relative z-10 mt-px"
      />
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="min-w-0 flex-1 text-left text-xs outline-none after:absolute after:inset-0 after:rounded-md"
      >
        <span
          className={cn(
            "line-clamp-3 leading-4 font-medium text-foreground",
            done && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}
        >
          {task.title}
        </span>
        <span className="mt-0.5 block truncate text-muted-foreground">
          {assigneesLabel(task.assignee_ids, profiles)}
        </span>
      </button>
    </div>
  )
}
