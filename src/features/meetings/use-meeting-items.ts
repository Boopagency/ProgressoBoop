"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  addMeetingItem,
  agreementToTask,
  deleteMeetingItem,
  updateMeetingItem,
} from "@/features/meetings/actions"
import type { MeetingItemInput, MeetingItemPatch } from "@/features/meetings/validation"
import type { MeetingItem } from "@/lib/types"

type Change =
  | { type: "add"; item: MeetingItem }
  | { type: "update"; id: string; patch: MeetingItemPatch }
  | { type: "remove"; id: string }

function applyChange(items: MeetingItem[], change: Change): MeetingItem[] {
  if (change.type === "add") return [...items, change.item]
  if (change.type === "remove") return items.filter((item) => item.id !== change.id)
  return items.map((item) => (item.id === change.id ? { ...item, ...change.patch } : item))
}

/** Itens recém-adicionados ainda sem id do banco: não dá para editar até o servidor responder. */
export function isPendingItem(item: MeetingItem): boolean {
  return item.id.startsWith("temp-")
}

/**
 * Assuntos e combinados de uma reunião, com as mudanças aparecendo na hora
 * (useOptimistic). Quando o servidor responde, a tela recebe os dados reais.
 */
export function useMeetingItems(meetingId: string, serverItems: MeetingItem[], currentUserId: string) {
  const [items, applyOptimistic] = useOptimistic(serverItems, applyChange)
  const [, startTransition] = useTransition()

  function add(input: MeetingItemInput, onError?: () => void) {
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        item: {
          id: `temp-${crypto.randomUUID()}`,
          meeting_id: meetingId,
          ...input,
          done: false,
          task_id: null,
          created_by: currentUserId,
          created_at: new Date().toISOString(),
        },
      })
      const result = await addMeetingItem(meetingId, input)
      if (!result.ok) {
        toast.error(result.error)
        onError?.()
      }
    })
  }

  function update(id: string, patch: MeetingItemPatch) {
    startTransition(async () => {
      applyOptimistic({ type: "update", id, patch })
      const result = await updateMeetingItem(id, patch)
      if (!result.ok) toast.error(result.error)
    })
  }

  function remove(item: MeetingItem) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", id: item.id })
      const result = await deleteMeetingItem(item.id)
      if (!result.ok) toast.error(result.error)
      else toast(item.kind === "topic" ? "Assunto removido" : "Combinado removido", {
        description: item.content,
      })
    })
  }

  function toTask(item: MeetingItem) {
    startTransition(async () => {
      const result = await agreementToTask(item.id)
      if (!result.ok) toast.error(result.error)
      else toast.success("Tarefa criada", { description: item.content })
    })
  }

  return {
    topics: items.filter((item) => item.kind === "topic"),
    agreements: items.filter((item) => item.kind === "agreement"),
    add,
    update,
    remove,
    toTask,
  }
}

export type MeetingItemsApi = ReturnType<typeof useMeetingItems>
