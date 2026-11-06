import { PortalProjectView } from "@/features/portal/project-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, deliverables, projectMessages, projects, projectSteps, stepApprovals } from "../exemplos"

/** O projeto aberto no portal, com uma etapa esperando a aprovação. */
export default function VitrineProjectPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/projetos">
      <PortalProjectView
        project={projects(today)[0]!}
        clientName={CLIENT.name}
        showClient={false}
        steps={projectSteps(today)[0]!}
        approvals={stepApprovals(today)}
        deliverables={deliverables(today)}
        messages={projectMessages(today)}
        today={today}
        live={false}
      />
    </VitrineShell>
  )
}
