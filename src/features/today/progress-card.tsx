import Link from "next/link"

import { ProgressMeter } from "@/components/progress-meter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { ProjectStats } from "@/features/projects/logic"
import { ProjectBar, ProjectTiming } from "@/features/projects/project-meta"
import type { Progress as ProgressValue } from "@/features/tasks/logic"
import { formatRange, type DateRange } from "@/lib/dates"
import type { DateKey, Project } from "@/lib/types"

export interface FocusEntry {
  project: Project
  stats: ProjectStats
  /** Parte da pessoa logada (só no filtro "Minhas"). */
  mine: ProgressValue | null
}

/**
 * Progresso da tela Hoje. Os projetos em foco (como o plano do mês) são a
 * informação principal e contam a equipe inteira; a semana vem abaixo,
 * menor, e segue o filtro Todas/Minhas.
 */
export function ProgressCard({
  focus,
  week,
  weekRange,
  today,
  className,
}: {
  focus: FocusEntry[]
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
  const [main, ...others] = focus

  if (!main) {
    return (
      <Card role="region" aria-labelledby="progress-title" className={className}>
        <CardHeader>
          <CardTitle id="progress-title" role="heading" aria-level={2}>
            Progresso
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weekMeter}
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            Fixe um projeto “em foco” para acompanhar o progresso dele aqui.{" "}
            <Link href="/projetos" className="font-medium text-foreground hover:text-brand-ink hover:underline">
              Ver projetos
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  const { project, stats, mine } = main
  return (
    <Card role="region" aria-labelledby="progress-title" className={className}>
      <CardHeader className="gap-1">
        <p className="text-xs text-muted-foreground">Em foco</p>
        <CardTitle id="progress-title" role="heading" aria-level={2} className="leading-snug">
          <Link href={`/projetos/${project.id}`} className="hover:text-brand-ink hover:underline">
            {project.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums">
            {stats.percent}%
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {stats.done} de {stats.total} {stats.total === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <Progress value={stats.percent} aria-label={`Progresso de ${project.name}`} className="mt-3 h-2" />
        <p className="mt-2.5 text-xs text-muted-foreground tabular-nums">
          <ProjectTiming project={project} today={today} className="text-xs" />
          {stats.overdue > 0 ? <span className="text-overdue"> · {stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}</span> : null}
          {mine ? ` · suas: ${mine.done} de ${mine.total}` : null}
        </p>

        {others.length > 0 ? (
          <ul className="mt-4 space-y-3 border-t pt-4">
            {others.map((entry) => (
              <li key={entry.project.id}>
                <Link href={`/projetos/${entry.project.id}`} className="group block">
                  <span className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate font-medium text-foreground group-hover:text-brand-ink group-hover:underline">
                      {entry.project.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entry.stats.percent}%</span>
                  </span>
                  <ProjectBar percent={entry.stats.percent} className="mt-1.5" />
                  <ProjectTiming project={entry.project} today={today} className="mt-1 block text-xs" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 border-t pt-4">{weekMeter}</div>
      </CardContent>
    </Card>
  )
}
