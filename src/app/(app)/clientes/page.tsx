import type { Metadata } from "next"

import { getEvents } from "@/features/calendar/queries"
import { ClientsView } from "@/features/clients/clients-view"
import { getClientReviews, getClients } from "@/features/clients/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Clientes" }

export default async function ClientsPage() {
  const [clients, reviews, tasks, events] = await Promise.all([
    getClients(),
    getClientReviews(),
    getTasks(),
    getEvents(),
  ])

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <ClientsView clients={clients} reviews={reviews} events={events} />
    </TasksProvider>
  )
}
