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
            "flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border bg-card transition-[border-color,box-shadow,background-color] duration-150 sm:w-auto",
            over === status && "border-glow/60 bg-glow-soft/40 shadow-[0_0_0_3px_var(--glow-soft),var(--shadow-card)]"
          )}
        >
          <header className="flex items-end gap-2.5 px-4 pt-4 pb-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 eyebrow text-muted-foreground">
                <StatusDot
                  status={status}
                  className={cn(
                    "size-1.5",
                    status === "doing" && "shadow-[0_0_8px_var(--warning)]",
                    status === "done" && "shadow-[0_0_8px_var(--success)]"
                  )}
                />
                <h2>{TASK_STATUS_LABEL[status]}</h2>
              </div>
              <span className="display-number text-[34px] leading-[0.85] text-foreground">{columns[status].length}</span>
            </div>
            {status === "done" ? (
              <span className="ml-auto pb-0.5 text-[11px] text-subtle-foreground">últimos {BOARD_DONE_DAYS} dias</span>
            ) : null}
          </header>
          <div role="list" className="flex min-h-24 flex-1 flex-col gap-2 border-t border-border px-2 pt-2 pb-2">
            {columns[status].length === 0 ? (
              <p className="m-1 rounded-xl border border-dashed border-foreground/15 px-2 py-6 text-center text-xs text-subtle-foreground">
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
      className="group cursor-grab rounded-xl border border-glass-edge bg-card-solid shadow-[inset_0_1px_0_var(--glass-highlight),0_1px_2px_rgb(0_0_0/0.06)] transition-[border-color,box-shadow,transform] duration-150 ease-glide hover:border-glow/40 hover:shadow-[inset_0_1px_0_var(--glass-highlight),0_10px_24px_-14px_var(--glow)] active:cursor-grabbing motion-safe:hover:-translate-y-px"
    >
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="block w-full rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
        {context ? (
          <span className="mt-1.5 inline-flex max-w-full items-center rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
            <span className="truncate">{context}</span>
          </span>
        ) : null}
        <span className="mt-2.5 flex items-center gap-2">
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
