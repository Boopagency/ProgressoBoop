import { ProgressMeter } from "@/components/progress-meter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Progress as ProgressValue } from "@/features/tasks/logic"
import { capitalize, daysBetween, formatRange, type DateRange } from "@/lib/dates"
import type { DateKey, Plan } from "@/lib/types"

function remainingDaysLabel(days: number): string {
  if (days < 0) return "prazo encerrado"
  if (days === 0) return "termina hoje"
  if (days === 1) return "falta 1 dia"
  return `faltam ${days} dias`
}

/**
 * Progresso da tela Hoje. O plano atual é a informação principal e conta a
 * equipe inteira; a semana vem abaixo, menor, e segue o filtro Todas/Minhas.
 */
export function ProgressCard({
  plan,
  planProgress,
  mine,
  week,
  weekRange,
  today,
  className,
}: {
  plan: Plan | null
  planProgress: ProgressValue | null
  /** Parte da pessoa logada no plano (só no filtro "Minhas"). */
  mine: ProgressValue | null
  week: ProgressValue
  weekRange: DateRange
  today: DateKey
  className?: string
}) {
  const weekMeter = (
    <ProgressMeter
      label="Semana"
      done={week.done}
      total={week.total}
      percent={week.percent}
      hint={formatRange(weekRange)}
    />
  )

  if (!plan || !planProgress) {
    return (
      <Card role="region" aria-labelledby="progress-title" className={className}>
        <CardHeader>
          <CardTitle id="progress-title" role="heading" aria-level={2}>
            Progresso
          </CardTitle>
        </CardHeader>
        <CardContent>{weekMeter}</CardContent>
      </Card>
    )
  }

  return (
    <Card role="region" aria-labelledby="progress-title" className={className}>
      <CardHeader className="gap-1">
        <p className="text-xs text-muted-foreground">Plano atual</p>
        <CardTitle id="progress-title" role="heading" aria-level={2} className="leading-snug">
          {plan.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums">
            {planProgress.percent}%
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {planProgress.done} de {planProgress.total}{" "}
            {planProgress.total === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <Progress
          value={planProgress.percent}
          aria-label={`Progresso do plano ${plan.name}`}
          className="mt-3 h-2"
        />
        <p className="mt-2.5 text-xs text-muted-foreground tabular-nums">
          {capitalize(remainingDaysLabel(daysBetween(today, plan.ends_on)))}
          {mine ? ` · suas: ${mine.done} de ${mine.total}` : null}
        </p>

        <div className="mt-5 border-t pt-4">{weekMeter}</div>
      </CardContent>
    </Card>
  )
}
