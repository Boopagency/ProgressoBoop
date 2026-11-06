import type { Metadata } from "next"

import { portalHref } from "@/features/portal/links"
import { getPortalProjects, getPortalProjectSteps } from "@/features/portal/project-queries"
import { PortalProjectsView } from "@/features/portal/projects-view"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Projetos" }

/** Projetos do cliente: situação, prazo, quanto já foi feito e a próxima etapa. */
export default async function PortalProjectsPage(props: PageProps<"/portal/projetos">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const projects = await getPortalProjects(client.id)
  const steps = await Promise.all(projects.map((project) => getPortalProjectSteps(project.id)))

  return (
    <PortalProjectsView
      clientName={client.name}
      projects={projects}
      steps={steps}
      today={todayKey()}
      projectHref={(id) => portalHref(`/portal/projetos/${id}`, client, user.clients)}
    />
  )
}
