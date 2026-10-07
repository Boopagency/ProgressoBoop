"use client"

import { ChevronDown, FolderKanban, Pin, Plus } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { updateProject } from "@/features/projects/actions"
import { compareProjects, isOpenProject, projectStats } from "@/features/projects/logic"
import { ProjectDialog, type ProjectDialogState } from "@/features/projects/project-dialog"
import {
  ProjectBar,
  ProjectStatusBadge,
  ProjectTiming,
  useProjectClientName,
} from "@/features/projects/project-meta"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { formatShortDate } from "@/lib/dates"
import type { DocSummary, Project, ProjectStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type Scope = "all" | "clients" | "internal" | "mine"

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "clients", label: "Clientes" },
  { value: "internal", label: "Internos" },
  { value: "mine", label: "Meus" },
]

const OPEN_GROUPS: { status: ProjectStatus; label: string }[] = [
  { status: "active", label: "Em andamento" },
  { status: "planned", label: "Planejados" },
  { status: "paused", label: "Pausados" },
]

export function ProjectsView({ docs }: { docs: DocSummary[] }) {
  const { projects, currentUser } = useWorkspace()
  const { tasks, today } = useTasks()
  const [scope, setScope] = useState<Scope>("all")
  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, key: 0 })
  const [showClosed, setShowClosed] = useState(false)
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))

  const visible = projects
    .filter((project) => {
      if (scope === "clients") return project.client_id !== null
      if (scope === "internal") return project.client_id === null
      if (scope === "mine") return project.owner_id === currentUser.id
      return true
    })
    .sort(compareProjects)
  const open = visible.filter(isOpenProject)
  const closed = visible.filter((project) => !isOpenProject(project))
  const active = projects.filter((project) => project.status === "active")
  const late = active.filter((project) => project.due_on !== null && project.due_on < today).length

  return (
    <PageContainer className="max-w-[1240px]">
      <PageHeader
        title="Projetos"
        description={[
          `${active.length} em andamento`,
          late > 0 ? `${late} com prazo vencido` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
            <Plus />
            Novo projeto
          </Button>
        }
      />

      <div className="mt-7 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl aria-label="Quais projetos" value={scope} onValueChange={setScope} options={SCOPE_OPTIONS} />
      </div>

      {open.length === 0 && closed.length === 0 ? (
        <EmptyState onCreate={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} />
      ) : (
        <div className="mt-8 space-y-9">
          {OPEN_GROUPS.map((group) => {
            const list = open.filter((project) => project.status === group.status)
            if (list.length === 0) return null
            return (
              <section key={group.status} aria-labelledby={`projetos-${group.status}`}>
                <h2 id={`projetos-${group.status}`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {group.label}
                  <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{list.length}</span>
                </h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {list.map((project) => (
                    <ProjectCard key={project.id} project={project} stats={projectStats(project.id, tasks, today)} />
                  ))}
                </div>
              </section>
            )
          })}
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto aberto aqui.</p>
          ) : null}

          {closed.length > 0 ? (
            <section aria-labelledby="projetos-encerrados">
              <button
                type="button"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((current) => !current)}
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <span id="projetos-encerrados">Concluídos e cancelados</span>
                <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{closed.length}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showClosed && "rotate-180")} />
              </button>
              {showClosed ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {closed.map((project) => (
                    <ProjectCard key={project.id} project={project} stats={projectStats(project.id, tasks, today)} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <ProjectDialog
        state={dialog}
        docs={docs}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </PageContainer>
  )
}

function ProjectCard({ project, stats }: { project: Project; stats: ReturnType<typeof projectStats> }) {
  const { today } = useTasks()
  const { profiles } = useWorkspace()
  const clientName = useProjectClientName()
  const [isPending, startTransition] = useTransition()
  const ownerIndex = profiles.findIndex((profile) => profile.id === project.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined

  function togglePin() {
    startTransition(async () => {
      const result = await updateProject(project.id, { pinned: !project.pinned })
      if (!result.ok) toast.error(result.error)
      else toast.success(project.pinned ? "Saiu do foco" : "Em foco na tela Hoje", { description: project.name })
    })
  }

  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/15">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{clientName(project)}</p>
          <h3 className="mt-0.5 font-display text-[15px] leading-6 font-semibold tracking-tight text-foreground">
            <Link href={`/projetos/${project.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:underline">
              {project.name}
            </Link>
          </h3>
        </div>
        <button
          type="button"
          onClick={togglePin}
          disabled={isPending}
          aria-pressed={project.pinned}
          aria-label={project.pinned ? `Tirar ${project.name} do foco` : `Colocar ${project.name} em foco`}
          title={project.pinned ? "Em foco na tela Hoje (clique para tirar)" : "Colocar em foco na tela Hoje"}
          className={cn(
            "relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
            project.pinned ? "text-brand-ink" : "text-subtle-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          )}
        >
          <Pin className={cn("size-3.5", project.pinned && "fill-current")} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <ProjectTiming project={project} today={today} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {stats.total === 0 ? "Sem tarefas ainda" : `${stats.done} de ${stats.total} tarefas`}
            {stats.overdue > 0 ? <span className="text-overdue"> · {stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}</span> : null}
          </span>
          <span className="font-medium text-foreground">{stats.percent}%</span>
        </div>
        <ProjectBar percent={stats.percent} className="mt-1.5" />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        {owner ? (
          <span className="flex items-center gap-1.5">
            <PersonAvatar
              name={owner.full_name}
              avatarUrl={owner.avatar_url}
              colorIndex={ownerIndex}
              size="sm"
              className="size-5 [&_[data-slot=avatar-fallback]]:text-[9px]"
            />
            {firstName(owner.full_name)}
          </span>
        ) : (
          <span>Sem responsável</span>
        )}
        {stats.nextDue && isOpenProject(project) ? (
          <span className="ml-auto tabular-nums">Próxima entrega {formatShortDate(stats.nextDue, today)}</span>
        ) : null}
      </div>
    </article>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <FolderKanban className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-semibold">Nenhum projeto por aqui</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Um projeto junta as tarefas de uma entrega (um site, uma identidade, a implantação de um cliente) ou de um ciclo
        interno, com prazo e progresso.
      </p>
      <Button size="sm" className="mt-5" onClick={onCreate}>
        Novo projeto
      </Button>
    </div>
  )
}
