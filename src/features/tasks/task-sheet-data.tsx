"use client"

import { createContext, use, type ReactNode } from "react"

import { loadActivity } from "@/features/activity/actions"
import { loadDeliverables } from "@/features/deliverables/actions"
import type { Deliverable } from "@/features/deliverables/logic"
import type { ActionResult, ActivityEntry } from "@/lib/types"

/**
 * De onde o painel da tarefa busca o que carrega ao abrir: o histórico com
 * os comentários e as entregas para o cliente. No app são as Server Actions;
 * a vitrine (só em desenvolvimento) troca por dados de exemplo, sem banco.
 */
export interface TaskSheetData {
  loadActivity: (taskId: string) => Promise<ActionResult<ActivityEntry[]>>
  loadDeliverables: (taskId: string) => Promise<ActionResult<Deliverable[]>>
}

/** Título das partes do painel (descrição, aprovação, entregas, atividade): rótulo pequeno com o ponto azul. */
export const SHEET_HEADING =
  "flex items-center gap-2 eyebrow text-muted-foreground before:size-1.5 before:rounded-full before:bg-glow before:shadow-[0_0_8px_var(--glow)] before:content-['']"

const SERVER: TaskSheetData = {
  loadActivity: (taskId) => loadActivity("task", taskId),
  loadDeliverables: (taskId) => loadDeliverables(taskId),
}

const TaskSheetDataContext = createContext<TaskSheetData>(SERVER)

export function TaskSheetDataProvider({ value, children }: { value: TaskSheetData; children: ReactNode }) {
  return <TaskSheetDataContext value={value}>{children}</TaskSheetDataContext>
}

export function useTaskSheetData(): TaskSheetData {
  return use(TaskSheetDataContext)
}
