"use client"

import { ProjectsView } from "@/features/projects/projects-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../frame"

/** Lista de projetos, com os em foco, com dados de exemplo. */
export default function VitrineAdminAProjectsPage() {
  const today = todayKey()
  return (
    <AdminAFrame active="/projetos" today={today}>
      <ProjectsView docs={[]} />
    </AdminAFrame>
  )
}
