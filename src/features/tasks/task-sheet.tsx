"use client"

import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CircleDashed,
  Eye,
  Flag,
  FolderKanban,
  MoreHorizontal,
  Tag,
  Trash2,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"

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
import { Checkbox } from "@/components/ui/checkbox"
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
import { ActivityFeed } from "@/features/activity/activity-feed"
import { DeliverablesPanel } from "@/features/deliverables/deliverables-panel"
import { ProjectSelect } from "@/features/projects/project-meta"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { ClientApprovalPanel } from "@/features/tasks/client-approval"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { DueLabel, HighPriorityIcon, StatusDot } from "@/features/tasks/task-meta"
import { SHEET_HEADING, useTaskSheetData } from "@/features/tasks/task-sheet-data"
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
import type { ActivityEntry, Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Valor usado nos Selects para "nenhum" (o Radix não aceita string vazia). */
const NONE = "none"

const PROPERTY_TRIGGER =
  "h-8 w-full min-w-0 justify-start gap-2 rounded-full border-transparent bg-transparent px-2.5 font-normal shadow-none hover:bg-accent data-[state=open]:bg-accent [&>svg:last-child]:hidden"


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
  const { profileById, clients, projectById } = useWorkspace()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  const [activityVersion, setActivityVersion] = useState(0)
  const data = useTaskSheetData()

  // Histórico e comentários: carrega ao abrir, quando a tarefa muda e depois
  // de cada comentário.
  useEffect(() => {
    let current = true
    void data.loadActivity(task.id).then((result) => {
      if (current && result.ok) setActivity(result.data)
    })
    return () => {
      current = false
    }
  }, [data, task.id, task.updated_at, activityVersion])

  const done = task.status === "done"
  const project = task.project_id ? projectById.get(task.project_id) : undefined
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

      <div className="flex h-14 shrink-0 items-center gap-2 border-b pr-14 pl-5">
        {project ? (
          <Link
            href={`/projetos/${project.id}`}
            className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-glass-edge bg-card px-2.5 text-xs text-muted-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] transition-colors hover:border-glow/40 hover:text-foreground"
          >
            <FolderKanban className="size-3.5 shrink-0 text-brand-ink" aria-hidden="true" />
            <span className="truncate">{project.name}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 eyebrow text-subtle-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_8px_var(--glow)]" />
            Tarefa
          </span>
        )}
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
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <TaskCheckbox
              size="lg"
              checked={done}
              onCheckedChange={() => toggleDone(task)}
              aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
              className="mt-1.5"
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
                "field-sizing-content w-full resize-none rounded-md bg-transparent font-display text-[22px] leading-8 font-medium tracking-[-0.025em] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0",
                done && "text-muted-foreground line-through decoration-muted-foreground/50"
              )}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-8">
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                task.status === "doing"
                  ? "border-attention-line/20 bg-attention-soft text-attention-ink"
                  : done
                    ? "border-success/25 bg-success/10 text-success-strong"
                    : "border-border text-muted-foreground"
              )}
            >
              <StatusDot status={task.status} className="size-1.5" />
              {TASK_STATUS_LABEL[task.status]}
            </span>
            {!done ? (
              <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5">
                <DueLabel due={task.due_date} today={today} className="text-xs" />
              </span>
            ) : null}
            {task.priority === "high" && !done ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-priority/25 bg-priority/10 pr-2.5 pl-1.5 text-xs font-medium text-priority">
                <HighPriorityIcon />
                Alta
              </span>
            ) : null}
          </div>
        </div>

        <dl className="mx-4 grid grid-cols-[116px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-2xl border bg-card px-3 py-2">
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
              className="h-8 w-full justify-start rounded-full px-2.5"
            />
          </Property>

          <Property icon={<CalendarDays />} label="Prazo">
            <DueDatePicker
              value={task.due_date}
              today={today}
              onChange={(due) => updateTask(task.id, { due_date: due })}
              className="h-8 w-full justify-start rounded-full px-2.5"
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

          <Property icon={<FolderKanban />} label="Projeto">
            <ProjectSelect
              value={task.project_id}
              clientId={task.client_id}
              placeholder="Nenhum"
              onChange={(projectId) => {
                const next = projectId ? projectById.get(projectId) : undefined
                // Projeto de cliente leva o cliente junto (se a tarefa ainda não tem).
                updateTask(task.id, {
                  project_id: projectId,
                  ...(next?.client_id && !task.client_id ? { client_id: next.client_id } : {}),
                })
              }}
              className={cn(PROPERTY_TRIGGER, "[&_[data-slot=select-value]]:truncate")}
            />
          </Property>

          {project?.client_id ? (
            <Property icon={<Eye />} label="Portal">
              <div className="flex flex-col">
                <label className="flex h-8 items-center gap-2 px-2 text-[13px] text-foreground">
                  <Checkbox
                    checked={task.client_visible || task.client_approval_required}
                    // Etapa que precisa de aprovação é sempre vista pelo cliente.
                    disabled={task.client_approval_required}
                    onCheckedChange={(checked) => updateTask(task.id, { client_visible: checked === true })}
                  />
                  O cliente vê esta etapa
                </label>
                <label className="flex h-8 items-center gap-2 px-2 text-[13px] text-foreground">
                  <Checkbox
                    checked={task.client_approval_required}
                    onCheckedChange={(checked) => updateTask(task.id, { client_approval_required: checked === true })}
                  />
                  Precisa da aprovação do cliente
                </label>
              </div>
            </Property>
          ) : null}
        </dl>

        {project?.client_id ? <ClientApprovalPanel task={task} /> : null}
        {project?.client_id ? <DeliverablesPanel task={task} /> : null}

        <div className="px-5 pt-6 pb-2">
          <label htmlFor="task-description" className={SHEET_HEADING}>
            Descrição
          </label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={commitDescription}
            placeholder="Adicione contexto, links ou próximos passos…"
            className="mt-2.5 min-h-24 resize-none rounded-2xl border-border bg-card shadow-none hover:border-foreground/15 focus-visible:border-ring focus-visible:bg-card"
          />
        </div>

        <section aria-labelledby="task-activity" className="px-5 pt-6 pb-6">
          <h3 id="task-activity" className={cn(SHEET_HEADING, "mb-3")}>
            Atividade
          </h3>
          {activity === null ? (
            <p className="text-[13px] text-muted-foreground">Carregando…</p>
          ) : (
            <ActivityFeed
              entries={activity}
              target={{ type: "task", id: task.id }}
              emptyText="Nenhuma mudança registrada ainda."
              onChanged={() => setActivityVersion((current) => current + 1)}
              limit={12}
            />
          )}
        </section>
      </div>

      <div className="shrink-0 space-y-0.5 border-t bg-foreground/[0.02] px-5 py-3 text-xs text-muted-foreground">
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
        {task.meeting_id ? (
          <p>
            Nasceu de um combinado de reunião ·{" "}
            <Link
              href={`/reunioes/${task.meeting_id}`}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              ver reunião
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </p>
        ) : null}
        {task.client_review_id && task.client_id ? (
          <p>
            Nasceu de uma revisão mensal do cliente ·{" "}
            <Link
              href={`/clientes/${task.client_id}`}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              ver cliente
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </p>
        ) : null}
        {task.doc_id ? (
          <p>
            Nasceu do checklist de um processo ·{" "}
            <Link
              href={`/processos/${task.doc_id}`}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              ver processo
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </p>
        ) : null}
        {task.communication_id ? (
          <p>
            Nasceu de uma comunicação com o cliente ·{" "}
            <Link
              href={task.client_id ? `/comunicacoes?cliente=${task.client_id}` : "/comunicacoes"}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              ver comunicações
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </p>
        ) : null}
        {task.content_post_id ? (
          <p>
            Nasceu de um post da Central de Conteúdo ·{" "}
            <Link
              href={`/conteudo?post=${task.content_post_id}`}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              ver post
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
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
