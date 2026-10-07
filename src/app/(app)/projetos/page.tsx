import type { Metadata } from "next"

import { getDocs } from "@/features/docs/queries"
import { ProjectsView } from "@/features/projects/projects-view"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Projetos" }

export default async function ProjectsPage() {
  const [tasks, docs] = await Promise.all([getTasks(), getDocs()])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <ProjectsView docs={docs} />
    </TasksProvider>
  )
}
