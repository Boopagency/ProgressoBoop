import type { Metadata } from "next"
import { notFound } from "next/navigation"

import type { PortalProject } from "@/features/portal/project-logic"
import {
  getPortalProjectMessages,
  getPortalProjects,
  getPortalProjectSteps,
  getPortalStepApprovals,
  getPortalStepDeliverables,
} from "@/features/portal/project-queries"
import { PortalProjectView } from "@/features/portal/project-view"
import { pickPortalClient, requirePortalUser, requireUnlockedClient, type PortalClient } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Projeto" }

/** Projeto aberto no portal: andamento, as etapas que o cliente acompanha e a conversa com a equipe. */
export default async function PortalProjectPage(props: PageProps<"/portal/projetos/[id]">) {
  const [user, params, searchParams] = await Promise.all([requirePortalUser(), props.params, props.searchParams])
  if (!isUuid(params.id)) notFound()

  // O projeto costuma ser do cliente escolhido; se não for, procura nos outros da conta.
  const picked = pickPortalClient(user, searchParams.cliente)
  const ordered = [picked, ...user.clients.filter((item) => item.id !== picked.id)]
  let found: { client: PortalClient; project: PortalProject } | null = null
  for (const candidate of ordered) {
    const project = (await getPortalProjects(candidate.id)).find((item) => item.id === params.id)
    if (project) {
      found = { client: candidate, project }
      break
    }
  }
  if (!found) notFound()
  const { client, project } = found
  // Achado em outro cliente da conta: vale o briefing pendente desse cliente.
  requireUnlockedClient(user, client)

  const [steps, messages, approvals, deliverables] = await Promise.all([
    getPortalProjectSteps(project.id),
    getPortalProjectMessages(project.id),
    getPortalStepApprovals(client.id),
    getPortalStepDeliverables(project.id),
  ])
  return (
    <PortalProjectView
      project={project}
      clientName={client.name}
      showClient={user.clients.length > 1}
      steps={steps}
      approvals={approvals.filter((item) => item.project_id === project.id)}
      deliverables={deliverables}
      messages={messages}
      today={todayKey()}
    />
  )
}
