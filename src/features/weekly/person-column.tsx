"use client"

import { Progress } from "@/components/ui/progress"
import { isDone } from "@/features/tasks/logic"
import { TaskRow } from "@/features/tasks/task-row"
import type { WeeklyReview } from "@/features/weekly/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import type { Profile, Task } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Coluna de uma pessoa na reunião: concluídas, atrasadas e desta semana. */
export function PersonColumn({
  profile,
  colorIndex,
  review,
}: {
  profile: Profile
  colorIndex: number
  review: WeeklyReview
}) {
  const titleId = `pessoa-${profile.id}`

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-xl border">
      <header className="border-b px-4 pt-4 pb-3.5">
        <div className="flex items-center gap-3">
          <PersonAvatar
            name={profile.full_name}
            avatarUrl={profile.avatar_url}
            colorIndex={colorIndex}
          />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="truncate text-sm font-semibold text-foreground">
              {profile.full_name}
            </h3>
            {profile.role ? (
              <p className="truncate text-xs text-muted-foreground">{profile.role}</p>
            ) : null}
          </div>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {review.progress.percent}%
          </span>
        </div>
        <Progress
          value={review.progress.percent}
          aria-label={`Progresso da semana de ${profile.full_name}`}
          className="mt-3 h-1 bg-muted"
        />
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          {review.progress.done} de {review.progress.total} com prazo nesta semana concluídas
        </p>
      </header>

      <div className="space-y-5 px-4 pt-4 pb-3">
        <ReviewList
          title="Concluídas na semana anterior"
          tasks={review.completedLastWeek}
          count={review.completedLastWeek.length}
          emptyText="Nenhuma."
        />
        <ReviewList
          title="Atrasadas"
          tasks={review.overdue}
          count={openCount(review.overdue)}
          emptyText="Nada atrasado."
          danger
        />
        <ReviewList
          title="Desta semana"
          tasks={review.thisWeek}
          count={openCount(review.thisWeek)}
          emptyText="Nada previsto."
        />
      </div>
    </section>
  )
}

/** Concluídas durante a reunião ficam na lista, mas não contam como pendentes. */
function openCount(tasks: Task[]): number {
  return tasks.filter((task) => !isDone(task)).length
}

function ReviewList({
  title,
  tasks,
  count,
  emptyText,
  danger = false,
}: {
  title: string
  tasks: Task[]
  count: number
  emptyText: string
  danger?: boolean
}) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {danger && count > 0 ? (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue" />
        ) : null}
        <span className={cn(danger && count > 0 && "text-foreground")}>{title}</span>
        <span className="tabular-nums">{count}</span>
      </h4>
      {tasks.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-subtle-foreground">{emptyText}</p>
      ) : (
        <div role="list" className="-mx-3 mt-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} showAssignees={false} />
          ))}
        </div>
      )}
    </div>
  )
}
