"use client"

import { Trash2 } from "lucide-react"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { firstName } from "@/features/tasks/logic"
import { addDecision, deleteDecision } from "@/features/weekly/actions"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { capitalize, formatWeekdayShort, toDateKey, toTimeLabel } from "@/lib/dates"
import type { DateKey, WeeklyDecision } from "@/lib/types"

type Change = { type: "add"; decision: WeeklyDecision } | { type: "remove"; id: string }

function applyChange(decisions: WeeklyDecision[], change: Change): WeeklyDecision[] {
  return change.type === "add"
    ? [...decisions, change.decision]
    : decisions.filter((decision) => decision.id !== change.id)
}

/** Lista simples de decisões da semana (sem comentários, sem fluxo). */
export function WeeklyDecisions({
  decisions,
  weekStart,
  previousWeekStart,
}: {
  decisions: WeeklyDecision[]
  weekStart: DateKey
  previousWeekStart: DateKey
}) {
  const { currentUser, profileById } = useWorkspace()
  const [items, applyOptimistic] = useOptimistic(decisions, applyChange)
  const [draft, setDraft] = useState("")
  const [, startTransition] = useTransition()

  const current = items.filter((decision) => decision.week_start === weekStart)
  const previous = items.filter((decision) => decision.week_start === previousWeekStart)

  function add() {
    const content = draft.trim()
    if (!content) return
    setDraft("")
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        decision: {
          id: `temp-${crypto.randomUUID()}`,
          content,
          week_start: weekStart,
          created_by: currentUser.id,
          created_at: new Date().toISOString(),
        },
      })
      const result = await addDecision(content, weekStart)
      if (!result.ok) {
        toast.error(result.error)
        setDraft(content)
      }
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", id })
      const result = await deleteDecision(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  function authorOf(decision: WeeklyDecision): string {
    const author = profileById.get(decision.created_by)
    return author ? firstName(author.full_name) : "Equipe"
  }

  return (
    <section aria-labelledby="decisoes" className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <h2 id="decisoes" className="text-sm font-semibold text-foreground">
          Decisões da semana
        </h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">{current.length}</span>
      </div>

      {current.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Nenhuma decisão registrada nesta semana.
        </p>
      ) : (
        <ol className="divide-y">
          {current.map((decision, index) => (
            <li key={decision.id} className="group flex items-start gap-3 px-5 py-3">
              <span className="w-4 shrink-0 pt-px text-[13px] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words text-foreground">{decision.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {authorOf(decision)} · {capitalize(formatWeekdayShort(toDateKey(decision.created_at)))},{" "}
                  {toTimeLabel(decision.created_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover decisão"
                className="-my-1 text-muted-foreground opacity-100 hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                onClick={() => remove(decision.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <form
        className="flex gap-2 border-t px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Registrar uma decisão…"
          aria-label="Nova decisão"
          maxLength={500}
          className="shadow-none"
        />
        <Button type="submit" variant="outline" className="shadow-none" disabled={!draft.trim()}>
          Adicionar
        </Button>
      </form>

      {previous.length > 0 ? (
        <div className="border-t bg-muted/40 px-5 py-4">
          <h3 className="text-xs font-medium text-muted-foreground">Semana anterior</h3>
          <ul className="mt-2 space-y-1.5">
            {previous.map((decision) => (
              <li key={decision.id} className="flex gap-2 text-[13px] text-muted-foreground">
                <span aria-hidden="true">–</span>
                <span className="min-w-0 break-words">{decision.content}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
