"use client"

import { assigneesLabel, isDone } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { DoingPill, DueLabel, HighPriorityIcon } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { TASK_AREA_LABEL } from "@/lib/labels"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Linha de tarefa: checkbox, título e uma linha de contexto
 * ("Tecnologia · Hertmann · Jabez"). O prazo fica à direita no desktop e na
 * linha de contexto no celular. A linha inteira abre o Sheet de detalhes.
 */
export function TaskRow({
  task,
  showAssignees = true,
  showDue = true,
}: {
  task: Task
  showAssignees?: boolean
  showDue?: boolean
}) {
  const { today, toggleDone, openTask } = useTasks()
  const { profiles, clientById } = useWorkspace()
  const done = isDone(task)

  const meta = [
    task.area ? TASK_AREA_LABEL[task.area] : null,
    task.client_id ? (clientById.get(task.client_id)?.name ?? null) : null,
    showAssignees ? assigneesLabel(task.assignee_ids, profiles) : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <div
      role="listitem"
      className="group/task relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/70 has-[button:focus-visible]:bg-muted/70"
    >
      <TaskCheckbox
        checked={done}
        onCheckedChange={() => toggleDone(task)}
        aria-label={done ? `Reabrir "${task.title}"` : `Concluir "${task.title}"`}
        className="relative z-10 mt-[1px]"
      />
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="flex min-w-0 flex-1 items-start gap-4 text-left outline-none after:absolute after:inset-0 after:rounded-lg"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "truncate text-sm leading-5 font-medium text-foreground transition-colors",
                done && "text-muted-foreground line-through decoration-muted-foreground/50"
              )}
            >
              {task.title}
            </span>
            {task.priority === "high" && !done ? <HighPriorityIcon /> : null}
            {task.status === "doing" ? <DoingPill /> : null}
          </span>
          {meta.length > 0 || showDue ? (
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-muted-foreground">
              {meta.map((part, index) => (
                <span key={part} className="flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden="true" className="text-subtle-foreground">·</span> : null}
                  <span className="truncate">{part}</span>
                </span>
              ))}
              {showDue ? (
                <span className="flex items-center gap-1.5 sm:hidden">
                  {meta.length > 0 ? (
                    <span aria-hidden="true" className="text-subtle-foreground">·</span>
                  ) : null}
                  <DueLabel due={task.due_date} today={today} muted={done} />
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {showDue ? (
          <DueLabel
            due={task.due_date}
            today={today}
            muted={done}
            className="hidden pt-px leading-5 sm:block"
          />
        ) : null}
      </button>
    </div>
  )
}
