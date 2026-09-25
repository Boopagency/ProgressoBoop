"use client"

import {
  Building2,
  CalendarDays,
  CircleDashed,
  Flag,
  FolderKanban,
  MoreHorizontal,
  Tag,
  Trash2,
  Users,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { StatusDot } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import {
  TASK_AREA_LABEL,
  TASK_AREAS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  isTaskArea,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/labels"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Valor usado nos Selects para "nenhum" (o Radix não aceita string vazia). */
const NONE = "none"

const PROPERTY_TRIGGER =
  "h-8 w-full min-w-0 justify-start gap-2 border-transparent bg-transparent px-2 font-normal shadow-none hover:bg-accent data-[state=open]:bg-accent [&>svg:last-child]:hidden"

export function TaskSheet({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[480px]">
        {task ? <TaskDetails key={task.id} task={task} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetails({ task }: { task: Task }) {
  const { today, updateTask, toggleDone, deleteTask } = useTasks()
  const { profileById, clients, plans, planById } = useWorkspace()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const done = task.status === "done"
  const plan = task.plan_id ? planById.get(task.plan_id) : undefined
  const creator = profileById.get(task.created_by)
  const selectableClients = clients.filter(
    (client) => client.active || client.id === task.client_id
  )

  function commitTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(task.title)
      return
    }
    if (next !== task.title) updateTask(task.id, { title: next })
  }

  function commitDescription() {
    const next = description.trim()
    if (next !== (task.description ?? "")) updateTask(task.id, { description: next || null })
  }

  function changeStatus(value: string) {
    if (!isTaskStatus(value) || value === task.status) return
    if (value === "done") toggleDone(task)
    else updateTask(task.id, { status: value })
  }

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{task.title}</SheetTitle>
      <SheetDescription className="sr-only">Detalhes e edição da tarefa.</SheetDescription>

      <div className="flex h-12 shrink-0 items-center gap-2 border-b pr-12 pl-5">
        <span className="truncate text-xs text-muted-foreground">
          {plan ? plan.name : "Tarefa"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label="Mais ações"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Excluir tarefa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <TaskCheckbox
            size="lg"
            checked={done}
            onCheckedChange={() => toggleDone(task)}
            aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
            className="mt-1"
          />
          <textarea
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            rows={1}
            aria-label="Título"
            className={cn(
              "field-sizing-content w-full resize-none rounded-md bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0",
              done && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}
          />
        </div>

        <dl className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 px-5">
          <Property icon={<CircleDashed />} label="Status">
            <Select value={task.status} onValueChange={changeStatus}>
              <SelectTrigger size="sm" className={PROPERTY_TRIGGER} aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {TASK_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <StatusDot status={status} />
                    {TASK_STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>

          <Property icon={<Users />} label="Responsáveis">
            <AssigneePicker
              value={task.assignee_ids}
              onChange={(ids) => updateTask(task.id, { assignee_ids: ids })}
              className="h-8 w-full justify-start px-2"
            />
          </Property>

          <Property icon={<CalendarDays />} label="Prazo">
            <DueDatePicker
              value={task.due_date}
              today={today}
              onChange={(due) => updateTask(task.id, { due_date: due })}
              className="h-8 w-full justify-start px-2"
              placeholder="Sem prazo"
            />
          </Property>

          <Property icon={<Flag />} label="Prioridade">
            <Select
              value={task.priority}
              onValueChange={(value) => {
                if (isTaskPriority(value)) updateTask(task.id, { priority: value })
              }}
            >
              <SelectTrigger size="sm" className={PROPERTY_TRIGGER} aria-label="Prioridade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {TASK_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {TASK_PRIORITY_LABEL[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>

          <Property icon={<Tag />} label="Área">
            <Select
              value={task.area ?? NONE}
              onValueChange={(value) =>
                updateTask(task.id, { area: isTaskArea(value) ? value : null })
              }
            >
              <SelectTrigger size="sm" className={PROPERTY_TRIGGER} aria-label="Área">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Sem área
                </SelectItem>
                {TASK_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>
                    {TASK_AREA_LABEL[area]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>

          <Property icon={<Building2 />} label="Cliente">
            <Select
              value={task.client_id ?? NONE}
              onValueChange={(value) =>
                updateTask(task.id, { client_id: value === NONE ? null : value })
              }
            >
              <SelectTrigger size="sm" className={PROPERTY_TRIGGER} aria-label="Cliente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Nenhum
                </SelectItem>
                {selectableClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>

          <Property icon={<FolderKanban />} label="Plano">
            <Select
              value={task.plan_id ?? NONE}
              onValueChange={(value) =>
                updateTask(task.id, { plan_id: value === NONE ? null : value })
              }
            >
              <SelectTrigger size="sm" className={PROPERTY_TRIGGER} aria-label="Plano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Nenhum
                </SelectItem>
                {plans.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>
        </dl>

        <div className="mt-5 border-t px-5 pt-5 pb-6">
          <label htmlFor="task-description" className="text-[13px] font-medium text-foreground">
            Descrição
          </label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={commitDescription}
            placeholder="Adicione contexto, links ou próximos passos…"
            className="mt-2 min-h-24 resize-none border-transparent bg-muted/50 shadow-none hover:bg-muted focus-visible:border-input focus-visible:bg-background"
          />
        </div>
      </div>

      <div className="shrink-0 space-y-0.5 border-t px-5 py-3 text-xs text-muted-foreground">
        <p>
          Criada por {creator ? firstName(creator.full_name) : "alguém da equipe"} em{" "}
          {formatShortDate(toDateKey(task.created_at))} às {toTimeLabel(task.created_at)}
        </p>
        {task.completed_at ? (
          <p>
            Concluída em {formatShortDate(toDateKey(task.completed_at))} às{" "}
            {toTimeLabel(task.completed_at)}
          </p>
        ) : null}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              “{task.title}” será removida para toda a equipe. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteTask(task.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Property({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <>
      <dt className="flex h-8 items-center gap-2 text-[13px] text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}
