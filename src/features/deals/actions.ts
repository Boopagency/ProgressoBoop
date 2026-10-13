"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { insertDeal, markDealWon, patchDeal, removeDeal, type WinResult } from "@/features/deals/mutations"
import type { DealInput, DealPatch, WinInput } from "@/features/deals/validation"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/* Server Actions do comercial: a sessão e a tela; a regra fica em mutations.ts. */

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function createDeal(input: DealInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertDeal(await createClient(), input))
}

/** Edita o negócio (inclusive mover de etapa, perder ou reabrir). Ganhar é com winDeal. */
export async function updateDeal(id: string, patch: DealPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchDeal(await createClient(), id, patch))
}

export async function deleteDeal(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await removeDeal(await createClient(), id))
}

/** Marca como ganho e cria cliente, contrato, entrada e projeto (o que foi pedido). */
export async function winDeal(id: string, input: WinInput): Promise<ActionResult<WinResult>> {
  await requireUser()
  return refreshed(await markDealWon(await createClient(), id, input))
}
