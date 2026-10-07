import type { Metadata } from "next"

import { getGoals } from "@/features/goals/queries"
import { GoalsView } from "@/features/goals/goals-view"
import { goalsView, METRIC_OPTIONS } from "@/features/goals/view-model"
import { buildContext } from "@/features/metrics/dashboard"
import { getMetricsSource } from "@/features/metrics/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Metas" }

export default async function GoalsPage() {
  const today = todayKey()
  const [source, goals] = await Promise.all([getMetricsSource(), getGoals()])
  const ctx = buildContext(source, today)

  return <GoalsView goals={goalsView(ctx, goals.objectives, goals.keyResults)} metrics={METRIC_OPTIONS} today={today} />
}
