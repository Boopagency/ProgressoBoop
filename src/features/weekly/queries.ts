import "server-only"

import { requireUser } from "@/features/auth/session"
import type { DateKey, WeeklyDecision } from "@/lib/types"
import { mockDb, snapshot } from "@/server/mock/db"

/** Decisões das semanas pedidas, em ordem de criação. */
export async function getDecisions(weekStarts: DateKey[]): Promise<WeeklyDecision[]> {
  await requireUser()
  return snapshot(
    mockDb()
      .decisions.filter((decision) => weekStarts.includes(decision.week_start))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  )
}
