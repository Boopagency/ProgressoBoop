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
  /** "danger": ponto vermelho (atrasadas); "brand": ponto ciano (hoje). */
  tone?: "default" | "danger" | "brand"
  action?: ReactNode
  showAssignees?: boolean
  showDue?: boolean
  className?: string
}) {
  // Concluídas que ficaram no lugar não contam como pendentes.
  const openCount = tasks.filter((task) => !isDone(task)).length

  return (
    <section id={id} aria-label={title} className={cn("scroll-mt-20 rounded-xl bg-card px-4 pt-2.5 pb-1.5 shadow-card sm:px-5", className)}>
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border/70">
        <SectionTitle count={openCount}>
          {tone !== "default" && openCount > 0 ? (
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", tone === "danger" ? "bg-overdue" : "bg-brand")}
            />
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
