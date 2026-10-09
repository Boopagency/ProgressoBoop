import type { Metadata } from "next"
import Link from "next/link"

import { nextStep, projectPercent, templateName } from "@/features/portal/project-logic"
import { getPortalProjects, getPortalProjectSteps } from "@/features/portal/project-queries"
import { PortalNav, portalHref } from "@/features/portal/portal-nav"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { ProjectBar, ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { formatShortDate, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Projetos" }

/** Projetos do cliente: situação, prazo, quanto já foi feito e a próxima etapa. */
export default async function PortalProjectsPage(props: PageProps<"/portal/projetos">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const projects = await getPortalProjects(client.id)
  const steps = await Promise.all(projects.map((project) => getPortalProjectSteps(project.id)))
  const today = todayKey()

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">{client.name}</h1>
      <PortalNav section="projetos" client={client} clients={user.clients} />

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
          Nenhum projeto por aqui ainda. Quando a equipe começar um site, uma identidade visual ou outro projeto para
          você, ele aparece aqui.
        </p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project, index) => {
            const percent = projectPercent(project)
            const next = nextStep(steps[index] ?? [])
            const kind = templateName(project.template)
            return (
              <li key={project.id}>
                <Link
                  href={portalHref(`/portal/projetos/${project.id}`, client, user.clients)}
                  className="block rounded-xl border bg-card px-4 py-3.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-foreground">{project.name}</p>
                      {kind ? <p className="text-xs text-muted-foreground">{kind}</p> : null}
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProjectBar percent={percent} className="flex-1" />
                    <span className="text-[13px] font-medium text-foreground tabular-nums">{percent}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
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
    </div>
  )
}
