"use client"

import type { ReactNode } from "react"

import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"

import { VITRINE_USER, vitrineTasks } from "../fixtures"
import { VitrineShell } from "../vitrine-shell"
import { gestaoWorkspace } from "./fixtures"

/** A casca da vitrine com o espaço de trabalho das telas de gestão (cinco clientes). */
export function GestaoFrame({ active, children }: { active: string; children: ReactNode }) {
  const today = todayKey()
  return (
    <WorkspaceProvider workspace={gestaoWorkspace(today)} currentUser={VITRINE_USER}>
      <NewTaskProvider>
        <VitrineShell area="admin" active={active}>
          <TasksProvider tasks={vitrineTasks(today)} today={today}>
            {children}
          </TasksProvider>
        </VitrineShell>
      </NewTaskProvider>
    </WorkspaceProvider>
  )
}
