import {
  compareCompleted,
  compareTasks,
  completedWithin,
  dueWithin,
  isDone,
  progressOf,
  type Progress,
} from "@/features/tasks/logic"
import { addDaysToKey, weekRangeOf, type DateRange } from "@/lib/dates"
import type { DateKey, Task } from "@/lib/types"

/**
 * Pauta da reunião de segunda, calculada a partir das tarefas.
 *
 * - Concluídas na semana anterior: `completed_at` entre a segunda e o domingo
 *   da semana passada.
 * - Atrasadas: abertas com prazo antes de hoje.
 * - Desta semana: abertas com prazo de hoje até domingo.
 * - Progresso: tarefas com prazo nesta semana (concluídas / total).
 *
 * Tarefas concluídas durante a reunião (`keepInPlace`) continuam na lista
 * em que estavam, riscadas.
 */
export interface WeeklyReview {
  completedLastWeek: Task[]
  overdue: Task[]
  thisWeek: Task[]
  progress: Progress
}

export interface WeekContext {
  today: DateKey
  week: DateRange
  previousWeek: DateRange
}

export function weekContext(today: DateKey): WeekContext {
  const week = weekRangeOf(today)
  return {
    today,
    week,
    previousWeek: { start: addDaysToKey(week.start, -7), end: addDaysToKey(week.start, -1) },
  }
}

export function weeklyReview(
  tasks: Task[],
  ctx: WeekContext,
  keepInPlace: ReadonlySet<string> = new Set()
): WeeklyReview {
  const pending = (task: Task) => !isDone(task) || keepInPlace.has(task.id)
  return {
    completedLastWeek: completedWithin(tasks, ctx.previousWeek).sort(compareCompleted),
    overdue: tasks
      .filter((task) => pending(task) && task.due_date !== null && task.due_date < ctx.today)
      .sort(compareTasks),
    thisWeek: tasks
      .filter(
        (task) =>
          pending(task) &&
          task.due_date !== null &&
          task.due_date >= ctx.today &&
          task.due_date <= ctx.week.end
      )
      .sort(compareTasks),
    progress: progressOf(dueWithin(tasks, ctx.week)),
  }
}
