import { ArrowUpRight, FolderOpen } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer } from "@/components/layout/page"
import { EmptyPanel } from "@/components/empty-panel"
import { nextStep, projectPercent, templateName, type PortalProject, type PortalStep } from "@/features/portal/project-logic"
import { PortalHeader } from "@/features/portal/portal-ui"
import { ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { formatShortDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface PortalProjectsData {
  clientName: string
  projects: PortalProject[]
  /** As etapas que o cliente vê de cada projeto, na mesma ordem. */
  steps: PortalStep[][]
  today: DateKey
  projectHref: (id: string) => string
}

/** Barra de andamento no gradiente da marca (verde quando termina). */
export function ProgressTrack({ percent, className }: { percent: number; className?: string }) {
  const value = Math.min(100, Math.max(0, percent))
  return (
    <span aria-hidden="true" className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <span
        className={cn(
          "block h-full rounded-full",
          value >= 100 ? "bg-success" : "bg-[image:var(--gradient-brand)] shadow-[0_0_12px_var(--glow-soft)]"
        )}
        style={{ width: `${value}%` }}
      />
    </span>
  )
}

/**
 * Projetos do cliente (menos os cancelados): cada um com a situação, o
 * modelo, quanto já foi feito em número grande, o prazo e a próxima etapa.
 */
export function PortalProjectsView({ clientName, projects, steps, today, projectHref }: PortalProjectsData) {
  const open = projects.filter((project) => project.status !== "done").length
  const done = projects.length - open

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Seus <em>projetos</em>
          </>
        }
        description="O andamento de cada projeto com a Boop, o prazo e a próxima etapa."
        stats={projects.length > 0 ? [{ label: "Em aberto", value: open }, { label: "Concluídos", value: done }] : undefined}
      />

      <PageBody>
        {projects.length === 0 ? (
          <EmptyPanel icon={FolderOpen} title="Nenhum projeto por aqui ainda">
            Quando a equipe começar um site, uma identidade visual ou outro projeto para você, ele aparece aqui com o
            andamento e as etapas.
          </EmptyPanel>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:gap-5">
            {projects.map((project, index) => {
              const percent = projectPercent(project)
              const next = nextStep(steps[index] ?? [])
              const kind = templateName(project.template)
              return (
                <li key={project.id}>
                  <Link
                    href={projectHref(project.id)}
                    className="group flex h-full flex-col rounded-[1.75rem] border bg-card p-5 outline-none transition-[border-color,box-shadow] duration-200 hover:border-glow/40 hover:shadow-float focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-6"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        {kind ? <p className="eyebrow text-muted-foreground">{kind}</p> : null}
                        <p className={cn("font-display text-[19px] leading-snug font-medium tracking-tight text-foreground", kind && "mt-1")}>
                          {project.name}
                        </p>
                      </div>
                      <ProjectStatusBadge status={project.status} />
                    </div>

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <p className="flex items-baseline gap-1">
                        <span className="display-number text-[56px] leading-[0.8] text-foreground">{percent}</span>
                        <span className="display-number text-2xl text-muted-foreground">%</span>
                        <span className="ml-1.5 text-[13px] text-muted-foreground">concluído</span>
                      </p>
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-foreground/20 text-foreground transition-colors group-hover:border-glow group-hover:bg-glow group-hover:text-white"
                      >
                        <ArrowUpRight className="size-4" />
                      </span>
                    </div>
                    <ProgressTrack percent={percent} className="mt-4" />

                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-4 text-[13px] text-muted-foreground">
                      <ProjectTiming project={project} today={today} />
                      {next ? (
                        <span className="min-w-0 truncate">
                          Próxima etapa: <span className="text-foreground">{next.title}</span>
                          {next.due_date ? ` · ${formatShortDate(next.due_date, today)}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>
    </PageContainer>
  )
}
