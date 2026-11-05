"use client"

import { TasksProvider } from "@/features/tasks/tasks-provider"
import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { TodayView } from "@/features/today/today-view"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import { greetingFor, todayKey } from "@/lib/dates"

import { VITRINE_FINANCE, VITRINE_USER, vitrineEvents, vitrineTasks, vitrineWorkspace } from "../fixtures"
import { VitrineShell } from "../vitrine-shell"

/** A tela Hoje de verdade, com dados de exemplo. */
export default function VitrineTodayPage() {
  const today = todayKey()
  return (
    <WorkspaceProvider workspace={vitrineWorkspace(today)} currentUser={VITRINE_USER}>
      <NewTaskProvider>
        <VitrineShell area="admin" active="/hoje">
          <TasksProvider tasks={vitrineTasks(today)} today={today}>
            <TodayView
              greeting={greetingFor()}
              events={vitrineEvents(today)}
              clients={[]}
              reviews={[]}
              meetingRecords={[]}
              meetingItems={[]}
              docs={[]}
              finance={VITRINE_FINANCE}
              deals={[]}
              posts={[]}
              requests={[]}
              initialScope="all"
            />
          </TasksProvider>
        </VitrineShell>
      </NewTaskProvider>
    </WorkspaceProvider>
  )
}
