import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getActivity } from "@/features/activity/queries"
import { getCommunications } from "@/features/communications/queries"
import { getDecisions } from "@/features/decisions/queries"
import { getDocs } from "@/features/docs/queries"
import { getFinance } from "@/features/finance/queries"
import { getProject } from "@/features/projects/queries"
import { ProjectView } from "@/features/projects/project-view"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export async function generateMetadata(props: PageProps<"/projetos/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const project = isUuid(id) ? await getProject(id) : null
  return { title: project?.name ?? "Projeto" }
}

export default async function ProjectPage(props: PageProps<"/projetos/[id]">) {
  const { id } = await props.params
  if (!isUuid(id)) notFound()

  const [project, tasks, activity, decisions, communications, finance, docs] = await Promise.all([
    getProject(id),
    getTasks(),
    getActivity({ projectId: id }),
    getDecisions(),
    getCommunications(),
    getFinance(),
    getDocs(),
  ])
  if (!project) notFound()

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <ProjectView
        key={project.id}
        project={project}
        activity={activity}
        decisions={decisions.filter((decision) => decision.project_id === project.id)}
        communications={communications.filter((item) => item.project_id === project.id)}
        finance={finance}
        docs={docs}
      />
    </TasksProvider>
  )
}
