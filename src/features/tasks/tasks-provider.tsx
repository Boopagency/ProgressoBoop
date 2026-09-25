"use client"

import {
  createContext,
  use,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  deleteTask as deleteTaskAction,
  updateTask as updateTaskAction,
} from "@/features/tasks/actions"
import { TaskSheet } from "@/features/tasks/task-sheet"
import type { TaskPatch } from "@/features/tasks/validation"
import type { ActionResult, DateKey, Task } from "@/lib/types"

type OptimisticChange =
  | { type: "update"; id: string; patch: TaskPatch }
  | { type: "delete"; id: string }

function applyChange(tasks: Task[], change: OptimisticChange): Task[] {
  if (change.type === "delete") return tasks.filter((task) => task.id !== change.id)
  return tasks.map((task) => {
    if (task.id !== change.id) return task
    const next: Task = { ...task, ...change.patch }
    if (change.patch.status !== undefined) {
      next.completed_at =
        change.patch.status !== "done"
          ? null
          : task.status === "done"
            ? task.completed_at
            : new Date().toISOString()
    }
    return next
  })
}

interface TasksContextValue {
  /** Tarefas com as alterações otimistas aplicadas. */
  tasks: Task[]
  today: DateKey
  /** Tarefas concluídas nesta tela que continuam no lugar até recarregar. */
  keepInPlace: ReadonlySet<string>
  toggleDone: (task: Task) => void
  updateTask: (id: string, patch: TaskPatch) => void
  deleteTask: (id: string) => void
  openTask: (id: string) => void
}

const TasksContext = createContext<TasksContextValue | null>(null)

/**
 * Estado das tarefas de uma tela: aplica mudanças na hora (useOptimistic),
 * grava via Server Action e mostra o Sheet de detalhes. Quando o servidor
 * responde, a tela é re-renderizada com os dados reais.
 */
export function TasksProvider({
  tasks: serverTasks,
  today,
  children,
}: {
  tasks: Task[]
  today: DateKey
  children: ReactNode
}) {
  const [tasks, applyOptimistic] = useOptimistic(serverTasks, applyChange)
  const [keepInPlace, setKeepInPlace] = useState<ReadonlySet<string>>(() => new Set())
  const [sheet, setSheet] = useState<{ id: string | null; open: boolean }>({
    id: null,
    open: false,
  })
  const [, startTransition] = useTransition()

  function mutate(change: OptimisticChange, run: () => Promise<ActionResult>) {
    startTransition(async () => {
      applyOptimistic(change)
      const result = await run()
      if (!result.ok) toast.error(result.error)
    })
  }

  function updateTask(id: string, patch: TaskPatch) {
    mutate({ type: "update", id, patch }, () => updateTaskAction(id, patch))
  }

  function toggleDone(task: Task) {
    const completing = task.status !== "done"
    const status = completing ? "done" : "todo"
    if (completing) {
      setKeepInPlace((previous) => new Set(previous).add(task.id))
      toast.success("Tarefa concluída", {
        description: task.title,
        duration: 4000,
        action: {
          label: "Desfazer",
          onClick: () => updateTask(task.id, { status: task.status }),
        },
      })
    }
    updateTask(task.id, { status })
  }

  function deleteTask(id: string) {
    setSheet((current) => ({ ...current, open: false }))
    mutate({ type: "delete", id }, async () => {
      const result = await deleteTaskAction(id)
      if (result.ok) toast("Tarefa excluída")
      return result
    })
  }

  function openTask(id: string) {
    setSheet({ id, open: true })
  }

  const sheetTask = sheet.id ? (tasks.find((task) => task.id === sheet.id) ?? null) : null

  return (
    <TasksContext
      value={{ tasks, today, keepInPlace, toggleDone, updateTask, deleteTask, openTask }}
    >
      {children}
      <TaskSheet
        task={sheetTask}
        open={sheet.open && sheetTask !== null}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
      />
    </TasksContext>
  )
}

export function useTasks(): TasksContextValue {
  const context = use(TasksContext)
  if (!context) throw new Error("useTasks precisa estar dentro de TasksProvider.")
  return context
}
