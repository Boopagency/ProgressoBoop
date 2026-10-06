import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DocView } from "@/features/docs/doc-view"
import { getDoc, getDocVersions } from "@/features/docs/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export async function generateMetadata(props: PageProps<"/processos/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const doc = isUuid(id) ? await getDoc(id) : null
  return { title: doc?.title ?? "Processo" }
}

export default async function DocPage(props: PageProps<"/processos/[id]">) {
  const { id } = await props.params
  if (!isUuid(id)) notFound()

  const [doc, versions, tasks] = await Promise.all([getDoc(id), getDocVersions(id), getTasks()])
  if (!doc) notFound()

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <DocView key={doc.id} doc={doc} versions={versions} />
    </TasksProvider>
  )
}
