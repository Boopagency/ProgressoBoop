import type { Metadata } from "next"

import { ContentView } from "@/features/content/content-view"
import { getContentPosts } from "@/features/content/queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Conteúdo" }

export default async function ContentPage() {
  // As tarefas vêm junto: o post mostra as tarefas das frentes e abre o painel delas.
  const [posts, tasks] = await Promise.all([getContentPosts(), getTasks()])
  return (
    <TasksProvider tasks={tasks} today={todayKey()}>
      <ContentView posts={posts} />
    </TasksProvider>
  )
}
