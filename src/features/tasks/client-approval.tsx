"use client"

import { CircleCheck, Clock, PencilLine } from "lucide-react"
import { useEffect, useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { loadClientMemberName } from "@/features/portal/access-actions"
import { useTasks } from "@/features/tasks/tasks-provider"
import { formatShortDate, todayKey, toDateKey } from "@/lib/dates"
import type { DateKey, Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Aprovação do cliente numa etapa de projeto, como a equipe vê: a etapa que
 * pede aprovação, a que espera o cliente (concluída e sem resposta) e a
 * resposta dele (aprovada ou ajustes pedidos, com a nota, quem e quando). Só
 * o portal grava a resposta; concluir de novo pede outra aprovação.
 */

export type ClientApprovalState = "none" | "on_done" | "awaiting" | "approved" | "changes"

type ApprovalFields = Pick<Task, "status" | "client_visible" | "client_approval_required" | "client_approval">

export function clientApprovalState(task: ApprovalFields): ClientApprovalState {
  if (task.client_approval === "approved") return "approved"
  if (task.client_approval === "changes") return "changes"
  if (!task.client_approval_required) return "none"
  return task.status === "done" ? "awaiting" : "on_done"
}

/** Etiqueta curta da etapa nas listas (só quando há algo a dizer). */
export function ClientApprovalBadge({ task, className }: { task: ApprovalFields; className?: string }) {
  const state = clientApprovalState(task)
  if (state !== "awaiting" && state !== "changes") return null
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-warning-ink",
        className
      )}
    >
      {state === "awaiting" ? <Clock className="size-3" aria-hidden="true" /> : <PencilLine className="size-3" aria-hidden="true" />}
      {state === "awaiting" ? "Esperando o cliente" : "Cliente pediu ajustes"}
    </span>
  )
}

/** Frase da resposta: "Aprovada por Bárbara em 12/10". */
export function approvalSentence(
  task: Pick<Task, "client_approval" | "client_approval_at">,
  who: string | null,
  today: DateKey
): string {
  const when = task.client_approval_at ? ` em ${formatShortDate(toDateKey(task.client_approval_at), today)}` : ""
  const by = who ? ` por ${who}` : ""
  return task.client_approval === "approved" ? `Aprovada${by}${when}` : `Ajustes pedidos${by}${when}`
}

/** O bloco "Aprovação do cliente" no painel da tarefa. */
export function ClientApprovalPanel({ task }: { task: Task }) {
  const state = clientApprovalState(task)
  const [names, setNames] = useState<Record<string, string>>({})
  const authorId = task.client_approval_by
  const today = todayKey()

  useEffect(() => {
    if (!authorId || names[authorId]) return
    let active = true
    void loadClientMemberName(authorId).then((result) => {
      if (active && result.ok) setNames((current) => ({ ...current, [authorId]: result.data }))
    })
    return () => {
      active = false
    }
  }, [authorId, names])

  if (state === "none") return null
  const who = authorId ? (names[authorId] ?? null) : null

  return (
    <section aria-labelledby="task-client-approval" className="border-t px-5 pt-5 pb-1">
      <h3 id="task-client-approval" className="mb-2 text-[13px] font-medium text-foreground">
        Aprovação do cliente
      </h3>
      {state === "on_done" ? (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Ao concluir esta etapa, ela vai para o cliente aprovar no portal.
        </p>
      ) : state === "awaiting" ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] leading-5 text-foreground">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
          Esperando o cliente aprovar no portal.
        </p>
      ) : (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-[13px] leading-5",
            state === "approved" ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10"
          )}
        >
          <p className="flex items-center gap-2 font-medium text-foreground">
            {state === "approved" ? (
              <CircleCheck className="size-4 shrink-0 text-success-ink" aria-hidden="true" />
            ) : (
              <PencilLine className="size-4 shrink-0 text-warning-ink" aria-hidden="true" />
            )}
            {approvalSentence(task, who, today)}
          </p>
          {task.client_approval_note ? (
            <p className="mt-1 border-l-2 pl-2 break-words whitespace-pre-line text-muted-foreground">
              {task.client_approval_note}
            </p>
          ) : null}
          {state === "changes" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              O pedido está na conversa do projeto. Ao concluir a etapa de novo, ela volta para o cliente aprovar.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * Cartão "Aprovação do cliente" na página do projeto: as etapas que pedem a
 * aprovação, as que esperam o cliente primeiro, com a resposta (quem, quando
 * e a nota). Clicar abre a tarefa.
 */
export function ProjectApprovalsCard({
  projectId,
  names,
}: {
  projectId: string
  /** Nome de cada conta de cliente que respondeu (por `user_id`). */
  names: Record<string, string>
}) {
  const { tasks, openTask, today } = useTasks()
  const order: Record<ClientApprovalState, number> = { awaiting: 0, changes: 1, on_done: 2, approved: 3, none: 4 }
  const steps = tasks
    .filter((task) => task.project_id === projectId && (task.client_approval_required || task.client_approval))
    .map((task) => ({ task, state: clientApprovalState(task) }))
    .sort((a, b) => order[a.state] - order[b.state] || (a.task.due_date ?? "9").localeCompare(b.task.due_date ?? "9"))
  if (steps.length === 0) return null
  const awaiting = steps.filter((step) => step.state === "awaiting").length

  return (
    <PanelCard
      id="aprovacao-cliente"
      title={
        <>
          Aprovação do cliente
          {awaiting > 0 ? <PanelCount value={awaiting} /> : null}
        </>
      }
    >
      <ul className="p-1.5">
        {steps.map(({ task, state }) => {
          const who = task.client_approval_by ? (names[task.client_approval_by] ?? null) : null
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => openTask(task.id)}
                className="block w-full rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="block truncate text-[13px] font-medium text-foreground">{task.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs leading-5",
                    state === "approved" ? "text-success-ink" : state === "on_done" ? "text-muted-foreground" : "text-warning-ink"
                  )}
                >
                  {state === "awaiting"
                    ? "Esperando o cliente aprovar"
                    : state === "on_done"
                      ? "Vai para o cliente ao concluir"
                      : approvalSentence(task, who, today)}
                </span>
                {task.client_approval_note && (state === "approved" || state === "changes") ? (
                  <span className="mt-0.5 line-clamp-2 border-l-2 pl-2 text-xs leading-5 text-muted-foreground">
                    {task.client_approval_note}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </PanelCard>
  )
}
