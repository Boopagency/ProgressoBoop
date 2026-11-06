import { PortalProjectsView } from "@/features/portal/projects-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, projects, projectSteps } from "../exemplos"

/** A lista de Projetos do portal, com dados de exemplo. */
export default function VitrineProjectsPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/projetos">
      <PortalProjectsView
        clientName={CLIENT.name}
        projects={projects(today)}
        steps={projectSteps(today)}
        today={today}
        projectHref={() => "/vitrine/portal-telas/projeto"}
      />
    </VitrineShell>
  )
}
