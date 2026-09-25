import type { Metadata } from "next"

import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { TasksView } from "@/features/tasks/tasks-view"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Tarefas" }

export default async function TasksPage() {
  const tasks = await getTasks()

  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <TasksView />
    </TasksProvider>
  )
}
