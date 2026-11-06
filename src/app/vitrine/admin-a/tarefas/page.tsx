"use client"

import { useSearchParams } from "next/navigation"

import { TasksView } from "@/features/tasks/tasks-view"
import { todayKey } from "@/lib/dates"

import { AdminAFrame } from "../frame"

/** Tarefas (lista, tabela e quadro) com dados de exemplo. `?vazio=1` mostra o vazio. */
export default function VitrineAdminATasksPage() {
  const today = todayKey()
  const empty = useSearchParams().get("vazio") === "1"
  return (
    <AdminAFrame active="/tarefas" today={today} tasks={empty ? [] : undefined}>
      <TasksView />
    </AdminAFrame>
  )
}
