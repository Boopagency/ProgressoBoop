import type { Metadata } from "next"

import { getCommunications } from "@/features/communications/queries"
import { CommunicationsView } from "@/features/communications/communications-view"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Comunicações" }

export default async function CommunicationsPage(props: PageProps<"/comunicacoes">) {
  const searchParams = await props.searchParams
  const client = typeof searchParams.cliente === "string" && isUuid(searchParams.cliente) ? searchParams.cliente : null
  const query = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 120) : ""
  const [communications, tasks] = await Promise.all([getCommunications(), getTasks()])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <CommunicationsView communications={communications} initialClient={client} initialQuery={query} />
    </TasksProvider>
  )
}
