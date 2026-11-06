"use client"

import { dragSource, KANBAN_CARD, KanbanBoard, KanbanColumn, KanbanColumnHeader, KanbanEmpty, useKanbanDrop } from "@/components/kanban"
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
  const columns = boardColumns(tasks, today, keepInPlace)
  const { over, dropTarget } = useKanbanDrop<TaskStatus>(DRAG_TYPE, move)

  function move(taskId: string, status: TaskStatus) {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task || task.status === status) return
    // Concluir pelo quadro funciona como o checkbox (aviso com "Desfazer").
    if (status === "done") toggleDone(task)
    else updateTask(task.id, { status })
  }

  // As três colunas dividem a largura toda (sem o limite das colunas do Comercial).
  return (
    <KanbanBoard className={cn("relative", className)}>
      {TASK_STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          label={TASK_STATUS_LABEL[status]}
          active={over === status}
          {...dropTarget(status)}
          className="sm:w-auto sm:min-w-[16rem] sm:flex-1 sm:basis-0 lg:max-w-none lg:min-w-[16rem]"
          header={
            <KanbanColumnHeader
              dot={
                <StatusDot
                  status={status}
                  className={cn(
                    "size-2.5",
                    status === "doing" && "shadow-[0_0_8px_var(--warning)]",
                    status === "done" && "shadow-[0_0_8px_var(--success)]"
                  )}
                />
              }
              title={TASK_STATUS_LABEL[status]}
              count={columns[status].length}
              hint={status === "done" ? `últimos ${BOARD_DONE_DAYS} dias` : " "}
            />
          }
        >
          {columns[status].length === 0 ? (
            <KanbanEmpty>{status === "done" ? "Nada concluído nesses dias." : "Arraste uma tarefa para cá."}</KanbanEmpty>
          ) : (
            columns[status].map((task) => <BoardCard key={task.id} task={task} />)
          )}
        </KanbanColumn>
      ))}
    </KanbanBoard>
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
    <div role="listitem" {...dragSource(DRAG_TYPE, task.id)} className={cn("group", KANBAN_CARD)}>
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="block w-full rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex items-start gap-1.5">
          <span
            className={cn(
              "line-clamp-3 flex-1 text-[15px] leading-5 font-semibold text-foreground",
              done && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}
          >
            {task.title}
          </span>
          {task.priority === "high" && !done ? <HighPriorityIcon className="mt-0.5" /> : null}
        </span>
        {context ? (
          <span className="mt-2 inline-flex max-w-full items-center rounded-full border border-border px-2.5 py-0.5 text-xs leading-5 text-muted-foreground">
            <span className="truncate">{context}</span>
          </span>
        ) : null}
        <span className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          <TaskDateLabel task={task} today={today} className="text-[13px]" />
          <span className="ml-auto flex items-center gap-1.5">
            {owners.length === 1 ? (
              <span className="text-[13px] text-muted-foreground">{firstName(owners[0]!.full_name)}</span>
            ) : null}
            <AvatarStack ids={task.assignee_ids} profiles={profiles} />
          </span>
        </span>
      </button>
    </div>
  )
}
