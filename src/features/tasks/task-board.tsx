"use client"

import { useState } from "react"

import { BOARD_DONE_DAYS, boardColumns, firstName } from "@/features/tasks/logic"
import { HighPriorityIcon, StatusDot, TaskDateLabel } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { AvatarStack } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { TASK_STATUS_LABEL, TASK_STATUSES } from "@/lib/labels"
import type { Task, TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const DRAG_TYPE = "application/x-boop-task"

/**
 * Quadro por status: A fazer, Fazendo e Feito (concluídas dos últimos 14
 * dias). Arrastar um cartão muda o status; no celular (sem arrastar) o
 * status muda no painel da tarefa.
 */
export function TaskBoard({ tasks, className }: { tasks: Task[]; className?: string }) {
  const { today, keepInPlace, toggleDone, updateTask } = useTasks()
  const [over, setOver] = useState<TaskStatus | null>(null)
  const columns = boardColumns(tasks, today, keepInPlace)

  function move(taskId: string, status: TaskStatus) {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task || task.status === status) return
    // Concluir pelo quadro funciona como o checkbox (aviso com "Desfazer").
    if (status === "done") toggleDone(task)
    else updateTask(task.id, { status })
  }

  return (
    <div
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0",
        className
      )}
    >
      {TASK_STATUSES.map((status) => (
        <section
          key={status}
          aria-label={TASK_STATUS_LABEL[status]}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            if (over !== status) setOver(status)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setOver(null)
            const id = event.dataTransfer.getData(DRAG_TYPE)
            if (id) move(id, status)
          }}
          className={cn(
            "flex w-[85%] shrink-0 snap-start flex-col rounded-xl border bg-muted/30 transition-colors sm:w-auto",
            over === status && "border-brand/50 bg-brand-soft/30"
          )}
        >
          <header className="flex items-center gap-2 px-3 pt-3 pb-2">
            <StatusDot status={status} />
            <h2 className="text-[13px] font-semibold text-foreground">{TASK_STATUS_LABEL[status]}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{columns[status].length}</span>
            {status === "done" ? (
              <span className="ml-auto text-[11px] text-subtle-foreground">últimos {BOARD_DONE_DAYS} dias</span>
            ) : null}
          </header>
          <div role="list" className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
            {columns[status].length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-subtle-foreground">
                {status === "done" ? "Nada concluído nesses dias." : "Arraste uma tarefa para cá."}
              </p>
            ) : (
              columns[status].map((task) => <BoardCard key={task.id} task={task} />)
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function BoardCard({ task }: { task: Task }) {
  const { today, openTask } = useTasks()
  const { profiles, clientById, projectById } = useWorkspace()
  const project = task.project_id ? projectById.get(task.project_id) : undefined
  const client = task.client_id ? clientById.get(task.client_id) : undefined
  const done = task.status === "done"
  const context = project?.name ?? client?.name ?? null
  const owners = profiles.filter((profile) => task.assignee_ids.includes(profile.id))

  return (
    <div
      role="listitem"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      className="group rounded-lg border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_6px_0_rgb(0_0_0/0.08)]"
    >
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="block w-full rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex items-start gap-1.5">
          <span
            className={cn(
              "line-clamp-3 flex-1 text-[13.5px] leading-5 font-medium text-foreground",
              done && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}
          >
            {task.title}
          </span>
          {task.priority === "high" && !done ? <HighPriorityIcon className="mt-0.5" /> : null}
        </span>
        {context ? <span className="mt-1 block truncate text-xs text-muted-foreground">{context}</span> : null}
        <span className="mt-2 flex items-center gap-2">
          <TaskDateLabel task={task} today={today} className="text-xs" />
          <span className="ml-auto flex items-center gap-1.5">
            {owners.length === 1 ? (
              <span className="text-xs text-muted-foreground">{firstName(owners[0]!.full_name)}</span>
            ) : null}
            <AvatarStack ids={task.assignee_ids} profiles={profiles} />
          </span>
        </span>
      </button>
    </div>
  )
}
