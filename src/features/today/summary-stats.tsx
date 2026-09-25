import type { TodaySummary } from "@/features/tasks/logic"
import { cn } from "@/lib/utils"

/** Os quatro indicadores discretos do topo da tela Hoje. */
export function SummaryStats({
  summary,
  className,
}: {
  summary: TodaySummary
  className?: string
}) {
  const items = [
    { label: "Atrasadas", value: summary.overdue, href: "#atrasadas", alert: summary.overdue > 0 },
    { label: "Para hoje", value: summary.today, href: "#hoje", alert: false },
    { label: "Esta semana", value: summary.week, href: "#esta-semana", alert: false },
    { label: "Concluídas na semana", value: summary.completedThisWeek, href: null, alert: false },
  ]

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4",
        className
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {item.alert ? (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue" />
              ) : null}
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-1.5 text-[26px] leading-8 font-semibold tracking-tight tabular-nums",
                item.alert ? "text-overdue" : "text-foreground"
              )}
            >
              {item.value}
            </dd>
          </>
        )
        return item.href ? (
          <a
            key={item.label}
            href={item.href}
            className="flex flex-col justify-between bg-background px-4 py-4 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5"
          >
            {content}
          </a>
        ) : (
          <div key={item.label} className="flex flex-col justify-between bg-background px-4 py-4 sm:px-5">
            {content}
          </div>
        )
      })}
    </dl>
  )
}
