"use client"

import { ArrowDown, ArrowUp } from "lucide-react"
import { useState } from "react"

import { isDone, sortTasks, type TaskSortKey } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { HighPriorityIcon, StatusDot, TaskDateLabel } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { AvatarStack } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { TASK_AREA_LABEL, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

const COLUMNS: { key: TaskSortKey; label: string; className?: string }[] = [
  { key: "title", label: "Tarefa", className: "min-w-[280px]" },
  { key: "status", label: "Status", className: "w-[118px]" },
  { key: "due", label: "Prazo", className: "w-[128px]" },
  { key: "priority", label: "Prioridade", className: "w-[104px]" },
  { key: "project", label: "Projeto", className: "w-[200px]" },
  { key: "client", label: "Cliente", className: "w-[150px]" },
  { key: "area", label: "Área", className: "w-[118px]" },
]

/**
 * Tabela de tarefas: uma linha por tarefa, colunas ordenáveis. Clicar na linha
 * abre o painel da tarefa; o checkbox conclui.
 */
export function TaskTable({ tasks, className }: { tasks: Task[]; className?: string }) {
  const { today, toggleDone, openTask } = useTasks()
  const { profiles, clientById, projectById } = useWorkspace()
  const [sort, setSort] = useState<{ key: TaskSortKey; direction: "asc" | "desc" }>({ key: "due", direction: "asc" })

  const rows = sortTasks(tasks, sort.key, sort.direction, {
    project: (id) => (id ? (projectById.get(id)?.name ?? "") : ""),
    client: (id) => (id ? (clientById.get(id)?.name ?? "") : ""),
    area: (area) => (area ? TASK_AREA_LABEL[area] : ""),
  })

  function toggleSort(key: TaskSortKey) {
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    )
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card", className)}>
      <table className="w-full min-w-[1080px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">Concluir</span>
            </th>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("px-2 py-1.5 font-medium", column.className)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                      active && "text-foreground"
                    )}
                  >
                    {column.label}
                    {active ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                </th>
              )
            })}
            <th scope="col" className="w-[92px] px-2 py-1.5 font-medium">
              Pessoas
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const done = isDone(task)
            const project = task.project_id ? projectById.get(task.project_id) : undefined
            const client = task.client_id ? clientById.get(task.client_id) : undefined
            return (
              <tr
                key={task.id}
                onClick={() => openTask(task.id)}
                className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50"
              >
                <td className="px-3 py-2 align-middle" onClick={(event) => event.stopPropagation()}>
                  <TaskCheckbox
                    checked={done}
                    onCheckedChange={() => toggleDone(task)}
                    aria-label={done ? `Reabrir "${task.title}"` : `Concluir "${task.title}"`}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openTask(task.id)
                    }}
                    className={cn(
                      "line-clamp-2 text-left text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline",
                      done && "text-muted-foreground line-through decoration-muted-foreground/50"
                    )}
                  >
                    {task.title}
                  </button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status={task.status} />
                    {TASK_STATUS_LABEL[task.status]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <TaskDateLabel task={task} today={today} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {task.priority === "high" ? <HighPriorityIcon /> : null}
                    <span className={cn(task.priority === "high" && "text-foreground")}>
                      {TASK_PRIORITY_LABEL[task.priority]}
                    </span>
                  </span>
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{project?.name ?? "—"}</td>
                <td className="max-w-[150px] truncate px-3 py-2 text-muted-foreground">{client?.name ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {task.area ? TASK_AREA_LABEL[task.area] : "—"}
                </td>
                <td className="px-3 py-2">
                  <AvatarStack ids={task.assignee_ids} profiles={profiles} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
