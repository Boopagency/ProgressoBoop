"use client"

import { CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { addReviewStep, saveReview, setReviewDone } from "@/features/clients/actions"
import { HealthDot, ReviewStateText } from "@/features/clients/client-meta"
import {
  addPeriods,
  checklistOf,
  monthName,
  periodOf,
  periodParam,
  reviewStatus,
} from "@/features/clients/logic"
import { REVIEW_NOTES_MAX } from "@/features/clients/validation"
import { useUnsavedWarning } from "@/features/meetings/summary-card"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { TaskRow } from "@/features/tasks/task-row"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, toDateKey } from "@/lib/dates"
import { CLIENT_HEALTH_LABEL, CLIENT_HEALTHS } from "@/lib/labels"
import type { ClientDetail, ClientHealth, ClientReview, DateKey, ReviewCheckItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const HEALTH_SELECTED: Record<ClientHealth, string> = {
  healthy: "border-success/40 bg-success/10 text-[oklch(0.38_0.1_158)]",
  attention: "border-amber-500/40 bg-amber-50 text-amber-900",
  at_risk: "border-overdue/40 bg-overdue/10 text-overdue",
}

const HEALTH_HINT: Record<ClientHealth, string> = {
  healthy: "Entregas em dia, cliente satisfeito.",
  attention: "Algo precisa de cuidado (prazo, resultado, relação).",
  at_risk: "Risco de perder o cliente ou problema sério.",
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

/**
 * Revisão mensal de um cliente. A revisão nasce na primeira mudança (saúde,
 * checklist, notas ou próximo passo), com o checklist padrão.
 */
export function ReviewCard({
  client,
  period,
  reviews,
}: {
  client: ClientDetail
  period: DateKey
  reviews: ClientReview[]
}) {
  const { tasks, today } = useTasks()
  const { currentUser, profileById } = useWorkspace()
  const status = reviewStatus(client, reviews, today, period)
  const review = status.review
  const [health, setHealth] = useState<ClientHealth | null>(review?.health ?? null)
  const [checklist, setChecklist] = useState<ReviewCheckItem[]>(() => checklistOf(review))
  const [notes, setNotes] = useState(review?.notes ?? "")
  const [noteState, setNoteState] = useState<SaveState>("idle")
  const savedNotes = useRef(review?.notes ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()
  const [isClosing, startClosing] = useTransition()

  const current = periodOf(today)
  const steps = review ? tasks.filter((task) => task.client_review_id === review.id) : []
  const doneItems = checklist.filter((item) => item.done).length
  const closer = review?.done_by ? profileById.get(review.done_by) : undefined

  useUnsavedWarning(noteState === "dirty" || noteState === "saving" || noteState === "error")
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function save(patch: Parameters<typeof saveReview>[2], undo: () => void) {
    startTransition(async () => {
      const result = await saveReview(client.id, period, patch)
      if (!result.ok) {
        undo()
        toast.error(result.error)
      }
    })
  }

  function chooseHealth(next: ClientHealth) {
    const previous = health
    const value = previous === next ? null : next
    setHealth(value)
    save({ health: value }, () => setHealth(previous))
  }

  function toggleItem(key: string, done: boolean) {
    const previous = checklist
    const next = checklist.map((item) => (item.key === key ? { ...item, done } : item))
    setChecklist(next)
    save({ checklist: next }, () => setChecklist(previous))
  }

  function saveNotes(value: string) {
    if (timer.current) clearTimeout(timer.current)
    if (value.trim() === savedNotes.current.trim()) {
      setNoteState((state) => (state === "dirty" ? "saved" : state))
      return
    }
    setNoteState("saving")
    void saveReview(client.id, period, { notes: value }).then((result) => {
      if (result.ok) {
        savedNotes.current = value
        setNoteState("saved")
      } else {
        setNoteState("error")
        toast.error(result.error)
      }
    })
  }

  function setDone(done: boolean) {
    startClosing(async () => {
      if (noteState === "dirty") saveNotes(notes)
      const result = await setReviewDone(client.id, period, done)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(done ? "Revisão concluída" : "Revisão reaberta", {
        description: `${client.name} · ${monthName(period)}`,
      })
    })
  }

  return (
    <section aria-labelledby="revisao-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3.5">
        <h2 id="revisao-titulo" className="text-sm font-semibold text-foreground">
          Revisão de {monthName(period)}
          {period.slice(0, 4) !== today.slice(0, 4) ? ` de ${period.slice(0, 4)}` : null}
        </h2>
        <ReviewStateText status={status} today={today} withMonth={false} className="text-xs" />
        <nav aria-label="Outros meses" className="ml-auto flex items-center gap-1">
          <Link
            href={`?mes=${periodParam(addPeriods(period, -1))}`}
            scroll={false}
            aria-label={`Revisão de ${monthName(addPeriods(period, -1))}`}
            className="grid size-7 place-content-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {period < current ? (
            <Link
              href={`?mes=${periodParam(addPeriods(period, 1))}`}
              scroll={false}
              aria-label={`Revisão de ${monthName(addPeriods(period, 1))}`}
              className="grid size-7 place-content-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="size-7" aria-hidden="true" />
          )}
        </nav>
      </header>

      <div className="space-y-6 px-4 py-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Como está o cliente?</p>
          <div role="radiogroup" aria-label="Saúde do cliente" className="mt-2 grid gap-2 sm:grid-cols-3">
            {CLIENT_HEALTHS.map((option) => {
              const selected = health === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseHealth(option)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    selected ? HEALTH_SELECTED[option] : "hover:bg-muted/60"
                  )}
                >
                  <HealthDot health={option} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{CLIENT_HEALTH_LABEL[option]}</span>
                    <span className={cn("block text-xs leading-snug", selected ? "opacity-80" : "text-muted-foreground")}>
                      {HEALTH_HINT[option]}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Checklist
            <span className="tabular-nums">
              {doneItems} de {checklist.length}
            </span>
          </p>
          <ul className="mt-1.5 -mx-2">
            {checklist.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={(checked) => toggleItem(item.key, checked === true)}
                    className="mt-0.5"
                  />
                  <span className={cn("text-sm leading-5", item.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground")}>
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="revisao-notas" className="text-xs font-medium text-muted-foreground">
              Notas da revisão
            </label>
            <span aria-live="polite" className={cn("text-xs text-muted-foreground", noteState === "error" && "text-destructive")}>
              {noteState === "dirty" || noteState === "saving" ? "Salvando…" : noteState === "saved" ? "Salvo" : noteState === "error" ? "Não foi salvo" : ""}
            </span>
          </div>
          <textarea
            id="revisao-notas"
            value={notes}
            maxLength={REVIEW_NOTES_MAX}
            onChange={(event) => {
              const next = event.target.value
              setNotes(next)
              setNoteState("dirty")
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => saveNotes(next), 1200)
            }}
            onBlur={() => saveNotes(notes)}
            placeholder="O que foi bem, o que preocupa, o que o cliente pediu…"
            className="mt-1.5 field-sizing-content block min-h-24 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Próximos passos</p>
          {steps.length > 0 ? (
            <div role="list" className="mt-1 -mx-3">
              {steps.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">
              O que fazer a partir desta revisão. Cada passo vira uma tarefa do cliente.
            </p>
          )}
          <NewStepForm clientId={client.id} period={period} defaultAssignee={client.owner_id ?? currentUser.id} />
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {review?.done && review.done_at
            ? `Concluída${closer ? ` por ${firstName(closer.full_name)}` : ""} em ${formatShortDate(toDateKey(review.done_at), today)}.`
            : status.due
              ? `Vence em ${formatShortDate(status.due, today)} (dia ${client.review_day} de cada mês).`
              : "Este cliente não tem revisão mensal; dá para registrar mesmo assim."}
        </p>
        {review?.done ? (
          <Button variant="outline" size="sm" onClick={() => setDone(false)} disabled={isClosing} className="gap-1.5 bg-background shadow-none">
            <RotateCcw />
            Reabrir
          </Button>
        ) : (
          <Button size="sm" onClick={() => setDone(true)} disabled={isClosing} className="gap-1.5">
            <CheckCheck />
            Concluir revisão
          </Button>
        )}
      </footer>
    </section>
  )
}

const CHIP =
  "h-8 rounded-md border border-input bg-background px-2.5 text-[13px] shadow-none hover:bg-accent"

function NewStepForm({
  clientId,
  period,
  defaultAssignee,
}: {
  clientId: string
  period: DateKey
  defaultAssignee: string
}) {
  const { today } = useTasks()
  const [title, setTitle] = useState("")
  const [assigneeIds, setAssigneeIds] = useState<string[]>([defaultAssignee])
  const [dueDate, setDueDate] = useState<DateKey | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    const text = title.trim()
    if (!text || isPending) return
    startTransition(async () => {
      const result = await addReviewStep(clientId, period, { title: text, assignee_ids: assigneeIds, due_date: dueDate })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setTitle("")
      setDueDate(null)
      toast.success("Próximo passo virou tarefa", { description: text })
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="mt-2 rounded-lg border border-dashed p-2"
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        placeholder="Novo próximo passo"
        aria-label="Novo próximo passo"
        className="h-8 w-full bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-subtle-foreground"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <AssigneePicker value={assigneeIds} onChange={setAssigneeIds} className={CHIP} />
        <DueDatePicker
          value={dueDate}
          onChange={setDueDate}
          today={today}
          className={CHIP}
          icon={<CalendarDays className="size-3.5 text-muted-foreground" />}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || isPending} className="ml-auto gap-1 shadow-none">
          <Plus />
          {isPending ? "Criando…" : "Adicionar"}
        </Button>
      </div>
    </form>
  )
}
