"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import type { JourneyMode, JourneyPhase } from "@/features/journey/catalog"
import type { JourneyMarkState } from "@/features/journey/logic"
import {
  advanceJourneyPhase,
  closeJourney,
  decideJourneyRenewal,
  insertJourney,
  markJourneyStep,
  patchJourney,
  type StartJourneyInput,
} from "@/features/journey/mutations"
import { todayKey } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"

/* Server Actions da jornada: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) {
    revalidatePath("/jornada")
    revalidatePath("/clientes/[id]", "page")
  }
  return result
}

export async function startJourney(input: Partial<StartJourneyInput>): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertJourney(await createClient(), input, todayKey()))
}

export async function markStep(input: {
  journey_id: string
  step_key: string
  state: JourneyMarkState
  note?: string | null
}): Promise<ActionResult<{ advanced: JourneyPhase | null }>> {
  await requireUser()
  return refreshed(await markJourneyStep(await createClient(), input, todayKey()))
}

export async function advancePhase(journeyId: string): Promise<ActionResult<{ phase: JourneyPhase | null }>> {
  await requireUser()
  return refreshed(await advanceJourneyPhase(await createClient(), journeyId, todayKey()))
}

export async function decideRenewal(input: {
  journey_id: string
  renewed: boolean
  contract_ends_on?: DateKey | null
}): Promise<ActionResult<{ phase: JourneyPhase }>> {
  await requireUser()
  return refreshed(await decideJourneyRenewal(await createClient(), input, todayKey()))
}

export async function updateJourney(input: {
  journey_id: string
  mode?: JourneyMode
  contract_ends_on?: DateKey | null
}): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchJourney(await createClient(), input))
}

export async function endJourney(journeyId: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await closeJourney(await createClient(), journeyId, todayKey()))
}
