"use client"

import { ChevronDown, FolderKanban, Pin, Plus } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { EmptyGlow } from "@/components/empty-glow"
import { PageBody, PageContainer, PageHeader, PageToolbar } from "@/components/layout/page"
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
import { useViewFade } from "@/hooks/use-view-fade"
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
  const bodyRef = useViewFade(scope)
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
  const focus = open.filter((project) => project.pinned)
  const closed = visible.filter((project) => !isOpenProject(project))
  const active = projects.filter((project) => project.status === "active")
  const late = active.filter((project) => project.due_on !== null && project.due_on < today).length

  return (
    <PageContainer>
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

      <PageToolbar>
        <SegmentedControl aria-label="Quais projetos" value={scope} onValueChange={setScope} options={SCOPE_OPTIONS} />
      </PageToolbar>

      {open.length === 0 && closed.length === 0 ? (
        <PageBody ref={bodyRef}>
          <EmptyState onCreate={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} />
        </PageBody>
      ) : (
        <PageBody ref={bodyRef}>
          {focus.length > 0 ? (
            <section
              aria-labelledby="projetos-foco"
              className="relative isolate overflow-hidden rounded-[2rem] glass-panel p-2 sm:p-2.5"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/3 -z-10 h-56 w-[30rem] rounded-full bg-glow-soft blur-3xl"
              />
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-3 sm:px-4">
                <Pin aria-hidden="true" className="size-3.5 fill-current text-brand-ink" />
                <h2 id="projetos-foco" className="eyebrow text-muted-foreground">
                  Em foco
                </h2>
                <span className="text-[13px] text-subtle-foreground tabular-nums">{focus.length}</span>
                <span className="ml-auto hidden text-xs text-subtle-foreground sm:inline">Aparecem na tela Hoje e na weekly</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {focus.map((project) => (
                  <ProjectCard key={project.id} project={project} stats={projectStats(project.id, tasks, today)} featured />
                ))}
              </div>
            </section>
          ) : null}
          {OPEN_GROUPS.map((group) => {
            const list = open.filter((project) => project.status === group.status && !project.pinned)
            if (list.length === 0) return null
            return (
              <section key={group.status} aria-labelledby={`projetos-${group.status}`}>
                <h2
                  id={`projetos-${group.status}`}
                  className="flex items-center gap-2 font-display text-sm font-medium tracking-[-0.01em] text-foreground"
                >
                  {group.label}
                  <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{list.length}</span>
                </h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                className="flex items-center gap-2 font-display text-sm font-medium tracking-[-0.01em] text-foreground"
              >
                <span id="projetos-encerrados">Concluídos e cancelados</span>
                <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{closed.length}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showClosed && "rotate-180")} />
              </button>
              {showClosed ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {closed.map((project) => (
                    <ProjectCard key={project.id} project={project} stats={projectStats(project.id, tasks, today)} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </PageBody>
      )}

      <ProjectDialog
        state={dialog}
        docs={docs}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </PageContainer>
  )
}

function ProjectCard({
  project,
  stats,
  featured = false,
}: {
  project: Project
  stats: ReturnType<typeof projectStats>
  /** No painel "Em foco": percentual maior e vidro mais claro. */
  featured?: boolean
}) {
  const { today } = useTasks()
  const { profiles } = useWorkspace()
  const clientName = useProjectClientName()
  const [isPending, startTransition] = useTransition()
  const ownerIndex = profiles.findIndex((profile) => profile.id === project.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  const closed = !isOpenProject(project)

  function togglePin() {
    startTransition(async () => {
      const result = await updateProject(project.id, { pinned: !project.pinned })
      if (!result.ok) toast.error(result.error)
      else toast.success(project.pinned ? "Saiu do foco" : "Em foco na tela Hoje", { description: project.name })
    })
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-[1.5rem] border bg-card p-5 transition-[border-color,box-shadow] duration-150 hover:border-glow/35 hover:shadow-[var(--shadow-card),0_14px_40px_-18px_var(--glow)]",
        closed && "opacity-80"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate eyebrow text-[10.5px] text-muted-foreground">{clientName(project)}</p>
          <h3 className="mt-1.5 font-display text-[17px] leading-6 font-medium tracking-[-0.015em] text-foreground">
            <Link
              href={`/projetos/${project.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-[1.5rem] focus-visible:underline"
            >
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
            "relative z-10 inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full text-xs font-medium outline-none transition-[background-color,color,opacity,box-shadow] touch-target focus-visible:ring-2 focus-visible:ring-ring/40",
            project.pinned
              ? "border border-glow/40 bg-glow-soft px-2.5 text-brand-ink shadow-[0_0_14px_-4px_var(--glow)] hover:bg-glow-soft/70"
              : "w-7 border border-transparent text-subtle-foreground opacity-0 group-hover:opacity-100 hover:border-glass-edge hover:bg-accent hover:text-foreground focus-visible:opacity-100 max-md:opacity-100"
          )}
        >
          <Pin className={cn("size-3.5", project.pinned && "fill-current")} aria-hidden="true" />
          {project.pinned ? "Em foco" : null}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <ProjectTiming project={project} today={today} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="flex items-start leading-none">
          <span
            className={cn(
              "display-number leading-[0.8] text-foreground",
              featured ? "text-[56px]" : "text-[44px]"
            )}
          >
            {stats.percent}
          </span>
          <span className={cn("display-number leading-none text-brand-ink", featured ? "text-2xl" : "text-xl")}>%</span>
        </p>
        <p className="pb-0.5 text-right text-xs text-muted-foreground tabular-nums">
          {stats.total === 0 ? "Sem tarefas ainda" : `${stats.done} de ${stats.total} tarefas`}
          {stats.overdue > 0 ? (
            <span className="block text-overdue">
              {stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      </div>
      <ProjectBar percent={stats.percent} className="mt-3" />

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
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
    <EmptyGlow
      icon={<FolderKanban />}
      title={
        <>
          Nenhum projeto por <em>aqui</em>
        </>
      }
      actions={
        <Button onClick={onCreate} className="gap-1.5">
          <Plus />
          Novo projeto
        </Button>
      }
    >
      Um projeto junta as tarefas de uma entrega (um site, uma identidade, a implantação de um cliente) ou de um ciclo
      interno, com prazo e progresso.
    </EmptyGlow>
  )
}
