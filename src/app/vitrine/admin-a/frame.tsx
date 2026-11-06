"use client"

import type { ReactNode } from "react"

import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { TaskSheetDataProvider } from "@/features/tasks/task-sheet-data"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import type { DateKey, Task } from "@/lib/types"

import { VITRINE_USER } from "../fixtures"
import { VitrineShell } from "../vitrine-shell"
import { adminASheetData, adminATasks, adminAWorkspace } from "./fixtures"

/**
 * Moldura das telas do lote 2A na vitrine: a casca do admin, a equipe, as
 * tarefas e o painel da tarefa com dados de exemplo (sem banco).
 */
export function AdminAFrame({
  active,
  today,
  tasks,
  children,
}: {
  /** Item do menu aceso (ex.: "/tarefas"). */
  active: string
  today: DateKey
  /** Tarefas da tela (padrão: as de exemplo). */
  tasks?: Task[]
  children: ReactNode
}) {
  return (
    <WorkspaceProvider workspace={adminAWorkspace(today)} currentUser={VITRINE_USER}>
      <TaskSheetDataProvider value={adminASheetData(today)}>
        <NewTaskProvider>
          <VitrineShell area="admin" active={active}>
            <TasksProvider tasks={tasks ?? adminATasks(today)} today={today}>
              {children}
            </TasksProvider>
          </VitrineShell>
        </NewTaskProvider>
      </TaskSheetDataProvider>
    </WorkspaceProvider>
  )
}
