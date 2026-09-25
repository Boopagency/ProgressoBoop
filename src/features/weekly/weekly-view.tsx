"use client"

import { PageContainer, PageHeader, SectionTitle } from "@/components/layout/page"
import { StatGrid } from "@/components/stat-grid"
import { isAssignedTo, isDone } from "@/features/tasks/logic"
import { NewTaskButton } from "@/features/tasks/new-task-dialog"
import { useTasks } from "@/features/tasks/tasks-provider"
import { weekContext, weeklyReview } from "@/features/weekly/logic"
import { PersonColumn } from "@/features/weekly/person-column"
import { WeeklyDecisions } from "@/features/weekly/weekly-decisions"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatRange } from "@/lib/dates"
import type { WeeklyDecision } from "@/lib/types"

export function WeeklyView({
  decisions,
  meetingLabel,
}: {
  decisions: WeeklyDecision[]
  /** Ex.: "Reunião às segundas, 07:00". */
  meetingLabel: string | null
}) {
  const { tasks, today, keepInPlace } = useTasks()
  const { profiles } = useWorkspace()

  const ctx = weekContext(today)
  const team = weeklyReview(tasks, ctx, keepInPlace)
  const overdueCount = team.overdue.filter((task) => !isDone(task)).length
  const thisWeekCount = team.thisWeek.filter((task) => !isDone(task)).length

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Weekly"
        description={[formatRange(ctx.week), meetingLabel].filter(Boolean).join(" · ")}
        actions={<NewTaskButton />}
      />

      <StatGrid
        className="mt-8"
        items={[
          { label: "Concluídas na semana anterior", value: team.completedLastWeek.length },
          { label: "Atrasadas", value: overdueCount, alert: overdueCount > 0 },
          { label: "Vencem nesta semana", value: thisWeekCount },
          {
            label: "Progresso da semana",
            value: `${team.progress.percent}%`,
            detail: `${team.progress.done} de ${team.progress.total}`,
            progress: team.progress.percent,
          },
        ]}
      />

      <SectionTitle className="mt-10">Por pessoa</SectionTitle>
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-3">
        {profiles.map((profile, index) => (
          <PersonColumn
            key={profile.id}
            profile={profile}
            colorIndex={index}
            review={weeklyReview(
              tasks.filter((task) => isAssignedTo(task, profile.id)),
              ctx,
              keepInPlace
            )}
          />
        ))}
      </div>

      <div className="mt-10 max-w-3xl">
        <WeeklyDecisions
          decisions={decisions}
          weekStart={ctx.week.start}
          previousWeekStart={ctx.previousWeek.start}
        />
      </div>
    </PageContainer>
  )
}
