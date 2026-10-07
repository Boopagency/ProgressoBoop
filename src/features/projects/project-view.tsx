"use client"

import {
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  Columns3,
  Copy,
  List,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer } from "@/components/layout/page"
import { PanelCard, PanelCount } from "@/components/panel-card"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { ActivityFeed } from "@/features/activity/activity-feed"
import { CommunicationsCard } from "@/features/communications/communications-card"
import { DecisionsCard } from "@/features/decisions/decisions-card"
import { ProjectFinanceCard } from "@/features/finance/finance-cards"
import { deleteProject, updateProject } from "@/features/projects/actions"
import { projectStats } from "@/features/projects/logic"
import { ProjectDialog, type ProjectDialogState } from "@/features/projects/project-dialog"
import { ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { templateLabel } from "@/features/projects/templates"
import { dayContext, firstName, groupTasks, TASK_GROUP_LABEL, type TaskGroupKey } from "@/features/tasks/logic"
import { useNewTask } from "@/features/tasks/new-task-dialog"
import { TaskBoard } from "@/features/tasks/task-board"
import { TaskRow } from "@/features/tasks/task-row"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import type {
  ActivityEntry,
  Communication,
  Decision,
  DocSummary,
  FinanceEntry,
  FinanceRecurrence,
  Project,
  ProjectStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const OPEN_GROUPS: TaskGroupKey[] = ["overdue", "today", "week", "later", "undated"]

export function ProjectView({
  project,
  activity,
  decisions,
  communications,
  finance,
  docs,
}: {
  project: Project
  activity: ActivityEntry[]
  decisions: Decision[]
  communications: Communication[]
  finance: { entries: FinanceEntry[]; recurrences: FinanceRecurrence[] }
  docs: DocSummary[]
}) {
  const router = useRouter()
  const { tasks, today } = useTasks()
  const { clientById, profileById } = useWorkspace()
  const { openNewTask } = useNewTask()
  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, key: 0 })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteTasks, setDeleteTasks] = useState(false)
  const [isPending, startTransition] = useTransition()
  const client = project.client_id ? clientById.get(project.client_id) : undefined
  const owner = project.owner_id ? profileById.get(project.owner_id) : undefined
  const stats = projectStats(project.id, tasks, today)
  const template = templateLabel(project.template)
  const taskDefaults = { project_id: project.id, client_id: project.client_id }

  function changeStatus(status: ProjectStatus, message: string) {
    startTransition(async () => {
      const result = await updateProject(project.id, { status })
      if (!result.ok) toast.error(result.error)
      else toast.success(message, { description: project.name })
    })
  }

  function togglePin() {
    startTransition(async () => {
      const result = await updateProject(project.id, { pinned: !project.pinned })
      if (!result.ok) toast.error(result.error)
      else toast.success(project.pinned ? "Saiu do foco" : "Em foco na tela Hoje e na weekly", { description: project.name })
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProject(project.id, deleteTasks)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmDelete(false)
      toast("Projeto excluído", { description: project.name })
      router.push("/projetos")
    })
  }

  return (
    <PageContainer className="max-w-[1280px]">
      <nav aria-label="Navegação" className="text-[13px]">
        <Link
          href="/projetos"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Projetos
        </Link>
      </nav>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            {project.pinned ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 px-2 text-[11.5px] font-medium text-brand-ink">
                <Pin className="size-3 fill-current" aria-hidden="true" />
                Em foco
              </span>
            ) : null}
            {template ? <span className="text-xs text-muted-foreground">{template}</span> : null}
          </div>
          <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-9">
            {project.name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            {client ? (
              <Link href={`/clientes/${client.id}`} className="text-foreground hover:text-brand-ink hover:underline">
                {client.name}
              </Link>
            ) : (
              <span>Interno</span>
            )}
            <span aria-hidden="true" className="text-subtle-foreground">·</span>
            <span>{owner ? `Responsável: ${firstName(owner.full_name)}` : "Sem responsável"}</span>
            <span aria-hidden="true" className="text-subtle-foreground">·</span>
            <span className="tabular-nums">
              {formatShortDate(project.starts_on, today)}
              {project.due_on ? ` → ${formatShortDate(project.due_on, today)}` : ""}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => openNewTask(taskDefaults)} className="gap-1.5 shadow-none">
            <Plus />
            Tarefa
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, project }))}
            className="gap-1.5 shadow-none"
          >
            <Pencil />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mais ações do projeto" disabled={isPending}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={togglePin}>
                <Pin />
                {project.pinned ? "Tirar do foco" : "Colocar em foco (Hoje e weekly)"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {project.status !== "done" ? (
                <DropdownMenuItem onSelect={() => changeStatus("done", "Projeto concluído")}>
                  <CheckCheck />
                  Concluir projeto
                </DropdownMenuItem>
              ) : null}
              {project.status === "active" || project.status === "planned" ? (
                <DropdownMenuItem onSelect={() => changeStatus("paused", "Projeto pausado")}>
                  <Pause />
                  Pausar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => changeStatus("active", "Projeto retomado")}>
                  <Play />
                  {project.status === "paused" ? "Retomar" : "Reabrir"}
                </DropdownMenuItem>
              )}
              {project.status !== "canceled" && project.status !== "done" ? (
                <DropdownMenuItem onSelect={() => changeStatus("canceled", "Projeto cancelado")}>
                  <XCircle />
                  Cancelar projeto
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  setDialog((current) => ({
                    open: true,
                    key: current.key + 1,
                    defaults: { client_id: project.client_id, source: { type: "project", id: project.id } },
                  }))
                }
              >
                <Copy />
                Novo projeto a partir deste
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                Excluir…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section aria-label="Progresso" className="mt-6 rounded-xl border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Progresso</p>
            <p className="font-display text-[28px] leading-8 font-semibold tracking-tight tabular-nums">{stats.percent}%</p>
          </div>
          <Stat label="Tarefas" value={`${stats.done} de ${stats.total}`} />
          <Stat label="Atrasadas" value={String(stats.overdue)} tone={stats.overdue > 0 ? "late" : undefined} />
          <Stat label="Próxima entrega" value={stats.nextDue ? formatShortDate(stats.nextDue, today) : "—"} />
          <div className="sm:ml-auto">
            <p className="text-xs text-muted-foreground">Prazo</p>
            <ProjectTiming project={project} today={today} className="text-sm" />
          </div>
        </div>
        <Progress value={stats.percent} aria-label={`Progresso de ${project.name}`} className="mt-4 h-2" />
      </section>

      {/* Celular: uma coluna só, com a atividade (a parte mais longa) no fim. */}
      <div className="mt-6 flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-x-8">
        <div className="contents xl:block xl:min-w-0 xl:space-y-6">
          <ProjectTasks projectId={project.id} onNew={() => openNewTask(taskDefaults)} />
          <PanelCard id="atividade-projeto" title="Atividade" className="order-last xl:order-none">
            <ActivityFeed
              entries={activity}
              target={{ type: "project", id: project.id }}
              withTitles
              emptyText="As mudanças nas tarefas, decisões e lançamentos do projeto aparecem aqui."
              limit={25}
              className="px-4 py-4"
            />
          </PanelCard>
        </div>
        <aside aria-label="Sobre o projeto" className="min-w-0 space-y-6">
          <PanelCard
            id="sobre-projeto"
            title="Sobre o projeto"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, project }))}
                className="h-7 px-2 text-xs"
              >
                Editar
              </Button>
            }
          >
            {project.description ? (
              <p className="px-4 py-3.5 text-[13px] leading-5 whitespace-pre-line text-foreground">{project.description}</p>
            ) : (
              <p className="px-4 py-3.5 text-[13px] text-muted-foreground">
                Sem descrição. Anote o objetivo, o escopo e os combinados com o cliente.
              </p>
            )}
          </PanelCard>
          <DecisionsCard
            decisions={decisions}
            defaults={{ project_id: project.id, client_id: project.client_id }}
            emptyText="Nada decidido ainda neste projeto."
          />
          {project.client_id ? (
            <CommunicationsCard
              communications={communications}
              defaults={{ client_id: project.client_id, project_id: project.id }}
            />
          ) : null}
          <ProjectFinanceCard project={project} entries={finance.entries} recurrences={finance.recurrences} today={today} />
        </aside>
      </div>

      <ProjectDialog state={dialog} docs={docs} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto sai da lista. Decisões, comunicações e lançamentos continuam, sem o projeto. Para só tirar da
              frente, use “Concluir” ou “Cancelar”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {stats.total > 0 ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={deleteTasks} onCheckedChange={(checked) => setDeleteTasks(checked === true)} />
              Excluir também as {stats.total} tarefas do projeto
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
            >
              {isPending ? "Excluindo…" : "Excluir projeto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "late" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium tabular-nums", tone === "late" ? "text-overdue" : "text-foreground")}>{value}</p>
    </div>
  )
}

/** Tarefas do projeto em lista (por prazo) ou quadro (por status). */
function ProjectTasks({ projectId, onNew }: { projectId: string; onNew: () => void }) {
  const { tasks, today, keepInPlace } = useTasks()
  const [mode, setMode] = useState<"list" | "board">("list")
  const [showDone, setShowDone] = useState(false)
  const own = tasks.filter((task) => task.project_id === projectId)
  const groups = groupTasks(own, dayContext(today), keepInPlace)
  const openCount = OPEN_GROUPS.reduce((total, key) => total + groups[key].length, 0)

  return (
    <PanelCard
      id="tarefas-projeto"
      title={
        <>
          Tarefas
          <PanelCount value={openCount} />
        </>
      }
      action={
        <div className="flex items-center gap-1">
          <div role="radiogroup" aria-label="Modo de exibição" className="flex rounded-md bg-muted p-0.5">
            {(
              [
                { value: "list", label: "Lista", icon: <List /> },
                { value: "board", label: "Quadro", icon: <Columns3 /> },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                title={option.label}
                onClick={() => setMode(option.value)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5",
                  mode === option.value && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                )}
              >
                {option.icon}
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onNew} className="h-7 gap-1 px-2 text-xs">
            <Plus className="size-3.5" />
            Nova
          </Button>
        </div>
      }
    >
      {own.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Nenhuma tarefa neste projeto ainda.</p>
      ) : mode === "board" ? (
        <TaskBoard tasks={own} className="px-3 py-3 sm:px-3" />
      ) : (
        <>
          {openCount === 0 ? (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">Todas as tarefas foram concluídas.</p>
          ) : (
            <div className="py-1">
              {OPEN_GROUPS.filter((key) => groups[key].length > 0).map((key) => (
                <div key={key}>
                  <p
                    className={cn(
                      "px-4 pt-2.5 pb-0.5 text-xs font-medium",
                      key === "overdue" ? "text-overdue" : "text-muted-foreground"
                    )}
                  >
                    {TASK_GROUP_LABEL[key]} · {groups[key].length}
                  </p>
                  <div role="list" className="px-1">
                    {groups[key].map((task) => (
                      <TaskRow key={task.id} task={task} showAssignees />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {groups.done.length > 0 ? (
            <div className="border-t">
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((current) => !current)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Concluídas · {groups.done.length}
                <ChevronDown className={cn("size-3.5 transition-transform", showDone && "rotate-180")} />
              </button>
              {showDone ? (
                <div role="list" className="px-1 pb-1">
                  {groups.done.map((task) => (
                    <TaskRow key={task.id} task={task} showAssignees />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </PanelCard>
  )
}
