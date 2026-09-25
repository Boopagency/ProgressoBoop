"use client"

import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import {
  currentPlan,
  dayContext,
  dueWithin,
  firstName,
  groupTasks,
  isAssignedTo,
  progressOf,
  summarize,
} from "@/features/tasks/logic"
import { NewTaskButton } from "@/features/tasks/new-task-dialog"
import { TaskSection } from "@/features/tasks/task-section"
import { useTasks } from "@/features/tasks/tasks-provider"
import { Agenda } from "@/features/today/agenda"
import { TODAY_SCOPE_COOKIE, type TodayScope } from "@/features/today/constants"
import { ProgressCard } from "@/features/today/progress-card"
import { SummaryStats } from "@/features/today/summary-stats"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatLongDate } from "@/lib/dates"
import type { CalendarEvent } from "@/lib/types"

const SCOPE_OPTIONS = [
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Todas" },
] as const

export function TodayView({
  greeting,
  events,
  initialScope,
}: {
  greeting: string
  events: CalendarEvent[]
  initialScope: TodayScope
}) {
  const { tasks, today, keepInPlace } = useTasks()
  const { currentUser, plans } = useWorkspace()
  const [scope, setScope] = useState<TodayScope>(initialScope)

  function changeScope(next: TodayScope) {
    setScope(next)
    document.cookie = `${TODAY_SCOPE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  const ctx = dayContext(today)
  const visible = scope === "mine" ? tasks.filter((task) => isAssignedTo(task, currentUser.id)) : tasks
  const groups = groupTasks(visible, ctx, keepInPlace)
  const summary = summarize(visible, ctx)
  const week = progressOf(dueWithin(visible, ctx.week))
  // O plano é da equipe: o percentual principal conta todas as tarefas dele.
  const plan = currentPlan(plans, today)
  const planTasks = plan ? tasks.filter((task) => task.plan_id === plan.id) : []
  const planProgress = plan ? progressOf(planTasks) : null
  const myPlanProgress =
    plan && scope === "mine"
      ? progressOf(planTasks.filter((task) => isAssignedTo(task, currentUser.id)))
      : null

  return (
    <PageContainer className="max-w-[1240px]">
      <PageHeader
        title={`${greeting}, ${firstName(currentUser.full_name)}`}
        description={formatLongDate(today)}
        actions={
          <>
            <SegmentedControl
              aria-label="Quais tarefas mostrar"
              value={scope}
              onValueChange={changeScope}
              options={SCOPE_OPTIONS}
            />
            <NewTaskButton />
          </>
        }
      />

      <SummaryStats summary={summary} className="mt-8" />

      {/*
        Celular: resumo → progresso → listas → agenda.
        Desktop: listas à esquerda; progresso e agenda na coluna da direita.
      */}
      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ProgressCard
          plan={plan}
          planProgress={planProgress}
          mine={myPlanProgress}
          week={week}
          weekRange={ctx.week}
          today={today}
          className="lg:col-start-2 lg:row-start-1"
        />

        <div className="min-w-0 space-y-9 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <TaskSection
            id="atrasadas"
            title="Atrasadas"
            tone="danger"
            tasks={groups.overdue}
            emptyText="Nada atrasado."
          />
          <TaskSection
            id="hoje"
            title="Hoje"
            tone="brand"
            tasks={groups.today}
            showDue={false}
            emptyText="Nenhuma tarefa com prazo para hoje."
          />
          <TaskSection
            id="esta-semana"
            title="Esta semana"
            tasks={groups.week}
            emptyText="Nada mais previsto até domingo."
          />
        </div>

        <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
          <Agenda events={events} today={today} />
        </div>
      </div>
    </PageContainer>
  )
}
