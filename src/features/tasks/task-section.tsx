import type { ReactNode } from "react"

import { SectionTitle } from "@/components/layout/page"
import { isDone } from "@/features/tasks/logic"
import { TaskRow } from "@/features/tasks/task-row"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Grupo de tarefas com título, contagem e estado vazio. */
export function TaskSection({
  id,
  title,
  tasks,
  emptyText,
  tone = "default",
  action,
  showAssignees,
  showDue,
  className,
}: {
  id?: string
  title: string
  tasks: Task[]
  emptyText?: ReactNode
  tone?: "default" | "danger"
  action?: ReactNode
  showAssignees?: boolean
  showDue?: boolean
  className?: string
}) {
  // Concluídas que ficaram no lugar não contam como pendentes.
  const openCount = tasks.filter((task) => !isDone(task)).length

  return (
    <section id={id} aria-label={title} className={cn("scroll-mt-16", className)}>
      <div className="flex h-8 items-center justify-between gap-2 border-b border-border/80">
        <SectionTitle count={openCount}>
          {tone === "danger" && openCount > 0 ? (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue" />
          ) : null}
          {title}
        </SectionTitle>
        {action}
      </div>
      {tasks.length === 0 ? (
        emptyText ? <p className="py-3 text-sm text-muted-foreground">{emptyText}</p> : null
      ) : (
        <div role="list" className="-mx-3 pt-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} showAssignees={showAssignees} showDue={showDue} />
          ))}
        </div>
      )}
    </section>
  )
}
