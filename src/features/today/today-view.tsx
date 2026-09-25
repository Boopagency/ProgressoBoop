"use client"

import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { ProgressMeter } from "@/components/progress-meter"
import { SegmentedControl } from "@/components/segmented-control"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { SummaryStats } from "@/features/today/summary-stats"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { daysBetween, formatLongDate, formatRange, formatShortDate } from "@/lib/dates"
import type { CalendarEvent } from "@/lib/types"

const SCOPE_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "mine", label: "Minhas" },
] as const

function remainingDaysLabel(days: number): string {
  if (days <= 0) return "termina hoje"
  if (days === 1) return "falta 1 dia"
  return `faltam ${days} dias`
}

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
  const plan = currentPlan(plans, today)
  const planProgress = plan ? progressOf(visible.filter((task) => task.plan_id === plan.id)) : null

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
        <Card
          role="region"
          aria-labelledby="progress-title"
          className="lg:col-start-2 lg:row-start-1"
        >
          <CardHeader>
            <CardTitle id="progress-title" role="heading" aria-level={2}>
              Progresso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProgressMeter
              label="Semana"
              done={week.done}
              total={week.total}
              percent={week.percent}
              hint={formatRange(ctx.week)}
            />
            {plan && planProgress ? (
              <ProgressMeter
                label={plan.name}
                done={planProgress.done}
                total={planProgress.total}
                percent={planProgress.percent}
                hint={`Até ${formatShortDate(plan.ends_on)} · ${remainingDaysLabel(daysBetween(today, plan.ends_on))}`}
              />
            ) : null}
          </CardContent>
        </Card>

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
