import { Asterisk } from "lucide-react"
import type { ReactNode } from "react"

import { HeroEyebrow, HeroPanel } from "@/components/hero-panel"
import { StatGrid } from "@/components/stat-grid"
import type { TodaySummary } from "@/features/tasks/logic"

/**
 * Abertura da tela Hoje: um painel de vidro com a luz azul atrás, a data em
 * pílula, a saudação grande (o nome na serifada itálica), os controles e os
 * quatro indicadores com números grandes. Os indicadores levam às listas.
 */
export function TodayHero({
  greeting,
  name,
  date,
  summary,
  controls,
}: {
  greeting: string
  name: string
  date: string
  summary: TodaySummary
  controls: ReactNode
}) {
  return (
    <HeroPanel aria-labelledby="hoje-titulo" light="aurora">
      <div className="flex items-start justify-between gap-4">
        <HeroEyebrow>{date}</HeroEyebrow>
        <Asterisk aria-hidden="true" className="size-8 text-foreground/80" strokeWidth={1.5} />
      </div>

      <div className="mt-8 flex flex-col gap-6 sm:mt-10 lg:flex-row lg:items-end lg:justify-between">
        <h1
          id="hoje-titulo"
          className="font-display text-[40px] leading-[1.02] font-medium tracking-[-0.045em] text-foreground sm:text-[60px] lg:text-[68px]"
        >
          {greeting},{" "}
          <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">{name}</em>
        </h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{controls}</div>
      </div>

      <StatGrid
        variant="line"
        size="lg"
        className="mt-8 sm:mt-10"
        items={[
          { label: "Atrasadas", value: summary.overdue, href: "#atrasadas", alert: summary.overdue > 0 },
          { label: "Para hoje", value: summary.today, href: "#hoje" },
          { label: "Esta semana", value: summary.week, href: "#esta-semana" },
          { label: "Concluídas na semana", value: summary.completedThisWeek },
        ]}
      />
    </HeroPanel>
  )
}
