"use client"

import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { TasksView } from "@/features/tasks/tasks-view"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"

import { VITRINE_USER, vitrineTasks, vitrineWorkspace } from "../fixtures"
import { VitrineShell } from "../vitrine-shell"

/** A tela Tarefas (lista densa) de verdade, com dados de exemplo. */
export default function VitrineTasksPage() {
  const today = todayKey()
  return (
    <WorkspaceProvider workspace={vitrineWorkspace(today)} currentUser={VITRINE_USER}>
      <NewTaskProvider>
        <VitrineShell area="admin" active="/tarefas">
          <TasksProvider tasks={vitrineTasks(today)} today={today}>
            <TasksView />
          </TasksProvider>
        </VitrineShell>
      </NewTaskProvider>
    </WorkspaceProvider>
  )
}
