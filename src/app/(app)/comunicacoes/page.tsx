import type { Metadata } from "next"

import { ChannelsView } from "@/features/channels/channels-view"
import { getChannels } from "@/features/channels/queries"
import { getCommunications } from "@/features/communications/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Comunicações" }

export default async function CommunicationsPage(props: PageProps<"/comunicacoes">) {
  const searchParams = await props.searchParams
  const query = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 120) : ""
  const [channels, communications, tasks] = await Promise.all([getChannels(), getCommunications(), getTasks()])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <ChannelsView channels={channels} communications={communications} initialQuery={query} />
    </TasksProvider>
  )
}
