"use client"

import { Check, ChevronRight } from "lucide-react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Progress } from "@/components/ui/progress"
import { updateMeetingItem } from "@/features/meetings/actions"
import { AgreementDue } from "@/features/meetings/agreements"
import {
  openCount,
  type Agenda,
  type AgendaAgreement,
  type AgendaTask,
  type TaskLists,
} from "@/features/meetings/logic"
import { assigneesLabel, firstName } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { DoingPill, StatusDot, TaskDateLabel } from "@/features/tasks/task-meta"
import { TaskRow } from "@/features/tasks/task-row"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import {
  capitalize,
  formatShortDate,
  formatWeekdayShort,
  toDateKey,
  toTimeLabel,
} from "@/lib/dates"
import { TASK_AREA_LABEL, TASK_STATUS_LABEL } from "@/lib/labels"
import type { DateKey, Task, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Pauta automática. Ao vivo, as tarefas são as de verdade (dá para concluir
 * durante a reunião). Depois de encerrada, mostra a pauta guardada.
 */
export type AgendaSource =
  | { live: true; agenda: Agenda<Task> }
  | { live: false; agenda: Agenda; frozenAt: Timestamp | null }

function untilLabel(until: DateKey, reference: DateKey): string {
  return `Até ${formatWeekdayShort(until)}, ${formatShortDate(until, reference)}`
}

export function FrozenNote({ frozenAt }: { frozenAt: Timestamp | null }) {
  if (!frozenAt) return null
  return (
    <p className="text-xs text-muted-foreground">
      Como estava ao encerrar, em {formatShortDate(toDateKey(frozenAt))} às {toTimeLabel(frozenAt)}.
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Combinados anteriores                                               */
/* ------------------------------------------------------------------ */

export function PreviousAgreementsCard({ source }: { source: AgendaSource }) {
  const { agreements, since } = source.agenda
  const pending = agreements.filter((agreement) => agreement.status !== "done").length

  return (
    <section aria-labelledby="anteriores-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 id="anteriores-titulo" className="text-sm font-semibold text-foreground">
            Combinados anteriores
          </h2>
          <span className="text-[13px] text-muted-foreground tabular-nums">{pending}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Da reunião de {formatShortDate(since)} e os que seguem em aberto.
        </p>
      </header>
      {agreements.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Nenhum combinado nas reuniões anteriores.
        </p>
      ) : source.live ? (
        <LiveAgreements agreements={agreements} />
      ) : (
        <ul className="divide-y">
          {agreements.map((agreement) => (
            <li key={agreement.id} className="flex items-start gap-3 px-4 py-2.5">
              <StaticCheck done={agreement.status === "done"} />
              <AgreementText agreement={agreement} done={agreement.status === "done"} since={since} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LiveAgreements({ agreements }: { agreements: AgendaAgreement[] }) {
  const { tasks, toggleDone } = useTasks()
  // Combinados sem tarefa: marcar como cumprido aparece na hora.
  const [overrides, setOverride] = useOptimistic(
    new Map<string, boolean>(),
    (current, change: { id: string; done: boolean }) => new Map(current).set(change.id, change.done)
  )
  const [, startTransition] = useTransition()
  const since = agreements.reduce(
    (latest, agreement) => (agreement.agreed_on > latest ? agreement.agreed_on : latest),
    ""
  )

  function toggle(agreement: AgendaAgreement, done: boolean) {
    startTransition(async () => {
      setOverride({ id: agreement.id, done })
      const result = await updateMeetingItem(agreement.id, { done })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <ul className="divide-y">
      {agreements.map((agreement) => {
        const task = agreement.task_id
          ? tasks.find((candidate) => candidate.id === agreement.task_id)
          : undefined
        const done = task
          ? task.status === "done"
          : (overrides.get(agreement.id) ?? agreement.status === "done")
        return (
          <li key={agreement.id} className="flex items-start gap-3 px-4 py-2.5">
            <TaskCheckbox
              checked={done}
              onCheckedChange={() => (task ? toggleDone(task) : toggle(agreement, !done))}
              aria-label={done ? `Reabrir "${agreement.content}"` : `Marcar "${agreement.content}" como cumprido`}
              className="mt-[1px]"
            />
            <AgreementText agreement={agreement} done={done} since={since} task={task} />
          </li>
        )
      })}
    </ul>
  )
}

function AgreementText({
  agreement,
  done,
  since,
  task,
}: {
  agreement: AgendaAgreement
  done: boolean
  since: DateKey
  task?: Task
}) {
  const { today, openTask } = useTasks()
  const { profileById } = useWorkspace()
  const owner = agreement.owner_id ? profileById.get(agreement.owner_id) : undefined

  return (
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          "text-sm leading-5 break-words whitespace-pre-line text-foreground",
          done && "text-muted-foreground line-through decoration-muted-foreground/50"
        )}
      >
        {agreement.content}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
        <span>{owner ? firstName(owner.full_name) : "Equipe"}</span>
        {agreement.due_date ? (
          <>
            <span aria-hidden="true" className="text-subtle-foreground">·</span>
            <AgreementDue due={agreement.due_date} done={done} today={today} />
          </>
        ) : null}
        {agreement.agreed_on < since ? (
          <>
            <span aria-hidden="true" className="text-subtle-foreground">·</span>
            <span>combinado em {formatShortDate(agreement.agreed_on, today)}</span>
          </>
        ) : null}
        {task ? (
          <>
            <span aria-hidden="true" className="text-subtle-foreground">·</span>
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground"
            >
              <StatusDot status={task.status} className="size-1.5" />
              Tarefa · {TASK_STATUS_LABEL[task.status]}
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}

function StaticCheck({ done }: { done: boolean }) {
  return (
    <span
      aria-label={done ? "Cumprido" : "Em aberto"}
      role="img"
      className={cn(
        "mt-[1px] grid size-[18px] shrink-0 place-content-center rounded-full border-[1.5px]",
        done ? "border-success bg-success text-white" : "border-muted-foreground/35"
      )}
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Tarefas (equipe ou cliente)                                         */
/* ------------------------------------------------------------------ */

export function TasksAgendaCard({
  source,
  clientName,
}: {
  source: AgendaSource
  clientName?: string | null
}) {
  const { profileById, profiles } = useWorkspace()
  const { agenda } = source

  const lists: TaskLists<AgendaTask>[] = agenda.client ? [agenda.client] : agenda.people
  // Uma tarefa de duas pessoas aparece nas duas listas, mas conta uma vez só.
  const unique = (pick: (list: TaskLists<AgendaTask>) => AgendaTask[], onlyOpen: boolean) =>
    new Set(
      lists.flatMap((list) =>
        pick(list)
          .filter((task) => !onlyOpen || task.status !== "done")
          .map((task) => task.id)
      )
    ).size
  const totals = {
    overdue: unique((list) => list.overdue, true),
    upcoming: unique((list) => list.upcoming, true),
    completed: unique((list) => list.completed, false),
  }

  return (
    <section aria-labelledby="tarefas-pauta-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-4 py-3.5">
        <h2 id="tarefas-pauta-titulo" className="text-sm font-semibold text-foreground">
          {agenda.client ? `Tarefas ${clientName ? `de ${clientName}` : "do cliente"}` : "Tarefas da equipe"}
        </h2>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <span className={cn(totals.overdue > 0 && "font-medium text-overdue")}>
            {totals.overdue} {totals.overdue === 1 ? "atrasada" : "atrasadas"}
          </span>
          <span>
            {totals.upcoming} até {formatShortDate(agenda.until, agenda.reference)}
          </span>
          <span>
            {totals.completed} {totals.completed === 1 ? "concluída" : "concluídas"} desde{" "}
            {formatShortDate(agenda.since, agenda.reference)}
          </span>
        </p>
      </header>

      {agenda.plan ? <PlanStrip plan={agenda.plan} /> : null}

      {agenda.client ? (
        <div className="px-4 py-3">
          <TaskGroups lists={agenda.client} source={source} showAssignees />
        </div>
      ) : (
        <div className="divide-y">
          {agenda.people.map((person) => {
            const profile = profileById.get(person.profile_id)
            if (!profile) return null
            const index = profiles.indexOf(profile)
            const overdue = openCount(person.overdue)
            const upcoming = openCount(person.upcoming)
            return (
              <details key={person.profile_id} open className="group/person">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                  <PersonAvatar
                    name={profile.full_name}
                    avatarUrl={profile.avatar_url}
                    colorIndex={index}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {profile.full_name}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      <span className={cn(overdue > 0 && "font-medium text-overdue")}>
                        {overdue} {overdue === 1 ? "atrasada" : "atrasadas"}
                      </span>
                      {" · "}
                      {upcoming} até {formatShortDate(agenda.until, agenda.reference)}
                      {" · "}
                      {person.completed.length}{" "}
                      {person.completed.length === 1 ? "concluída" : "concluídas"}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open/person:rotate-90"
                    aria-hidden="true"
                  />
                </summary>
                <div className="px-4 pb-3">
                  <TaskGroups lists={person} source={source} showAssignees={false} />
                </div>
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PlanStrip({ plan }: { plan: NonNullable<Agenda["plan"]> }) {
  const percent = plan.total === 0 ? 0 : Math.round((plan.done / plan.total) * 100)
  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] text-muted-foreground">
          Plano · <span className="text-foreground">{plan.name}</span>
        </p>
        <p className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          <span className="font-display text-base font-semibold text-foreground">{percent}%</span> ·{" "}
          {plan.done} de {plan.total}
        </p>
      </div>
      <Progress value={percent} aria-label={`Progresso do plano ${plan.name}`} className="mt-2 h-1.5" />
    </div>
  )
}

function TaskGroups({
  lists,
  source,
  showAssignees,
}: {
  lists: TaskLists<AgendaTask>
  source: AgendaSource
  showAssignees: boolean
}) {
  const { reference, until, since } = source.agenda
  const groups = [
    { key: "overdue", title: "Atrasadas", tasks: lists.overdue, danger: true },
    { key: "upcoming", title: capitalize(untilLabel(until, reference)), tasks: lists.upcoming, danger: false },
    {
      key: "completed",
      title: `Concluídas desde ${formatShortDate(since, reference)}`,
      tasks: lists.completed,
      danger: false,
    },
  ].filter((group) => group.tasks.length > 0)

  if (groups.length === 0) {
    return <p className="py-1 text-[13px] text-muted-foreground">Nada pendente nem concluído no período.</p>
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {group.danger ? <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue" /> : null}
            <span className={cn(group.danger && "text-foreground")}>{group.title}</span>
            <span className="tabular-nums">
              {group.key === "completed" ? group.tasks.length : openCount(group.tasks)}
            </span>
          </h3>
          <div role="list" className="-mx-3 mt-0.5">
            {group.tasks.map((task) =>
              source.live ? (
                <TaskRow key={task.id} task={task as Task} showAssignees={showAssignees} />
              ) : (
                <FrozenTaskRow key={task.id} task={task} showAssignees={showAssignees} />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Linha de tarefa como estava ao encerrar, no mesmo desenho da TaskRow (só
 * leitura; abre a tarefa se ela ainda existe).
 */
function FrozenTaskRow({ task, showAssignees }: { task: AgendaTask; showAssignees: boolean }) {
  const { tasks, today, openTask } = useTasks()
  const { profiles, clientById } = useWorkspace()
  const exists = tasks.some((candidate) => candidate.id === task.id)
  const done = task.status === "done"
  const meta = [
    task.area ? TASK_AREA_LABEL[task.area] : null,
    task.client_id ? (clientById.get(task.client_id)?.name ?? null) : null,
    showAssignees ? assigneesLabel(task.assignee_ids, profiles) : null,
  ].filter((part): part is string => Boolean(part))

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "mt-[1px] grid size-[18px] shrink-0 place-content-center rounded-full border-[1.5px]",
          done ? "border-success bg-success text-white" : "border-muted-foreground/35"
        )}
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-start gap-4">
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "line-clamp-2 text-sm leading-5 font-medium break-words text-foreground @lg:line-clamp-1",
                done && "text-muted-foreground line-through decoration-muted-foreground/50"
              )}
            >
              {task.title}
            </span>
            {task.status === "doing" ? <DoingPill /> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-muted-foreground">
            {meta.map((part, index) => (
              <span key={part} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true" className="text-subtle-foreground">·</span> : null}
                <span className="truncate">{part}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5 @lg:hidden">
              {meta.length > 0 ? <span aria-hidden="true" className="text-subtle-foreground">·</span> : null}
              <TaskDateLabel task={task} today={today} />
            </span>
          </span>
        </span>
        <TaskDateLabel task={task} today={today} className="hidden pt-px leading-5 @lg:block" />
      </span>
    </>
  )

  const rowClass = "@container flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left"
  return (
    <div role="listitem">
      {exists ? (
        <button
          type="button"
          onClick={() => openTask(task.id)}
          aria-label={`${task.title} (${TASK_STATUS_LABEL[task.status]})`}
          className={cn(rowClass, "transition-colors hover:bg-muted/70")}
        >
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </div>
  )
}
