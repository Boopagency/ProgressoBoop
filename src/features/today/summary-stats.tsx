import { StatGrid } from "@/components/stat-grid"
import type { TodaySummary } from "@/features/tasks/logic"

/** Os quatro indicadores discretos do topo da tela Hoje. */
export function SummaryStats({
  summary,
  className,
}: {
  summary: TodaySummary
  className?: string
}) {
  return (
    <StatGrid
      className={className}
      items={[
        { label: "Atrasadas", value: summary.overdue, href: "#atrasadas", alert: summary.overdue > 0 },
        { label: "Para hoje", value: summary.today, href: "#hoje" },
        { label: "Esta semana", value: summary.week, href: "#esta-semana" },
        { label: "Concluídas na semana", value: summary.completedThisWeek },
      ]}
    />
  )
}
