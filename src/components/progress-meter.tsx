import type { ReactNode } from "react"

import { Progress } from "@/components/ui/progress"

/** Barra de progresso compacta com rótulo, percentual e "X de Y". Sem gráficos. */
export function ProgressMeter({
  label,
  done,
  total,
  percent,
  hint,
  className,
}: {
  label: string
  done: number
  total: number
  percent: number
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</p>
        <p className="text-[13px] font-medium text-foreground tabular-nums">{percent}%</p>
      </div>
      <Progress value={percent} aria-label={label} className="mt-2 h-1" />
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {done} de {total} {total === 1 ? "tarefa concluída" : "tarefas concluídas"}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
