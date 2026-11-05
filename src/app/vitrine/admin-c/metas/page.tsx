"use client"

import { GoalsView } from "@/features/goals/goals-view"
import { goalsView, METRIC_OPTIONS } from "@/features/goals/view-model"
import { buildContext } from "@/features/metrics/dashboard"
import { todayKey } from "@/lib/dates"

import { gestaoGoals, gestaoMetricsSource } from "../fixtures"
import { GestaoFrame } from "../gestao-frame"

/** Metas de verdade, com dados de exemplo. */
export default function VitrineGoalsPage() {
  const today = todayKey()
  const ctx = buildContext(gestaoMetricsSource(today), today)
  const goals = gestaoGoals(today)
  return (
    <GestaoFrame active="/metas">
      <GoalsView goals={goalsView(ctx, goals.objectives, goals.keyResults)} metrics={METRIC_OPTIONS} today={today} />
    </GestaoFrame>
  )
}
