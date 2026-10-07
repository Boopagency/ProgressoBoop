"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { compareProjects, isOpenProject, projectStats } from "@/features/projects/logic"
import { ProjectDialog, type ProjectDialogState } from "@/features/projects/project-dialog"
import { ProjectBar, ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { DocSummary } from "@/lib/types"

/** Projetos de um cliente (abertos primeiro), com "Novo" já ligado a ele. */
export function ClientProjectsCard({ clientId, docs }: { clientId: string; docs: DocSummary[] }) {
  const { projects } = useWorkspace()
  const { tasks, today } = useTasks()
  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, key: 0 })
  const [showClosed, setShowClosed] = useState(false)
  const own = projects.filter((project) => project.client_id === clientId).sort(compareProjects)
  const open = own.filter(isOpenProject)
  const closed = own.filter((project) => !isOpenProject(project))
  const visible = showClosed ? own : open

  return (
    <PanelCard
      id="projetos-cliente"
      title={
        <>
          Projetos
          <PanelCount value={open.length} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, defaults: { client_id: clientId } }))}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Novo
        </Button>
      }
    >
      {visible.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          {closed.length > 0 ? "Nenhum projeto aberto." : "Nenhum projeto com este cliente ainda (site, identidade, implantação…)."}
        </p>
      ) : (
        <ul className="divide-y">
          {visible.map((project) => {
            const stats = projectStats(project.id, tasks, today)
            return (
              <li key={project.id}>
                <Link href={`/projetos/${project.id}`} className="block px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{project.name}</span>
                    <ProjectStatusBadge status={project.status} />
                  </span>
                  <span className="mt-2 flex items-center gap-3">
                    <ProjectBar percent={stats.percent} className="flex-1" />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {stats.done}/{stats.total}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs">
                    <ProjectTiming project={project} today={today} className="text-xs" />
                    {stats.overdue > 0 ? <span className="text-overdue">· {stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}</span> : null}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {closed.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowClosed((current) => !current)}
          className="block w-full border-t px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showClosed ? "Esconder concluídos e cancelados" : `Concluídos e cancelados · ${closed.length}`}
        </button>
      ) : null}
      <ProjectDialog state={dialog} docs={docs} onOpenChange={(next) => setDialog((current) => ({ ...current, open: next }))} />
    </PanelCard>
  )
}
