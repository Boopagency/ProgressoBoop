import type { Communication } from "@/lib/types"

/* Regras das comunicações (registros de contato com o cliente). Funções puras. */

/** A mais recente primeiro (pelo dia em que aconteceu, depois pelo registro). */
export function compareCommunications(a: Communication, b: Communication): number {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
  return b.created_at.localeCompare(a.created_at)
}
