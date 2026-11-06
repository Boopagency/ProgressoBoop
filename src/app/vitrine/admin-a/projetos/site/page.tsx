"use client"

import { ProjectView } from "@/features/projects/project-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../../frame"
import { adminADecisions, adminAThread, adminAWorkspace } from "../../fixtures"

/** Página do projeto (site do Café Aurora) com dados de exemplo e a conversa com o cliente. */
export default function VitrineAdminAProjectPage() {
  const today = todayKey()
  const project = adminAWorkspace(today).projects.find((item) => item.id === "p-site")!
  return (
    <AdminAFrame active="/projetos" today={today}>
      <VitrineProject today={today} project={project} />
    </AdminAFrame>
  )
}

function VitrineProject({ today, project }: { today: string; project: Parameters<typeof ProjectView>[0]["project"] }) {
  return (
    <ProjectView
      project={project}
      activity={[]}
      decisions={adminADecisions(today)}
      communications={[]}
      finance={{ entries: [], recurrences: [] }}
      docs={[]}
      approvalNames={{}}
      loadThread={adminAThread(today)}
    />
  )
}
