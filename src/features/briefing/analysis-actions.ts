"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { analysisReadiness, isAnalysisRunning } from "@/features/briefing/analysis-logic"
import { buildBriefingView } from "@/features/briefing/team-logic"
import { getTeamBriefing } from "@/features/briefing/team-queries"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * "Gerar análise agora" / "Refazer análise" (issue #108). Põe a análise do
 * briefing na fila, com a sessão da pessoa (`request_briefing_analysis`
 * confere a equipe e o corte de novo). O cron de cada minuto a processa; a
 * tela se atualiza sozinha enquanto ela roda.
 */

const BRIEFING_GONE = { ok: false, error: "Esse briefing não existe mais. Atualize a página." } as const

export async function requestBriefingAnalysis(clientId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return BRIEFING_GONE

  const state = await getTeamBriefing(clientId)
  if (!state.available || !state.briefing) return BRIEFING_GONE
  const briefing = state.briefing
  if (isAnalysisRunning(briefing.analysis ?? null)) return { ok: true, data: null }

  const readiness = analysisReadiness(buildBriefingView(briefing), briefing.status)
  if (!readiness.canRequest) {
    return { ok: false, error: `Responda pelo menos 60% das obrigatórias antes (faltam ${readiness.missingForCut}).` }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("request_briefing_analysis", { target_briefing: briefing.id })
  if (error) {
    if (error.message === "not_enough_answers") {
      return { ok: false, error: "Responda pelo menos 60% das obrigatórias antes de gerar a análise." }
    }
    if (error.message === "briefing_not_found") return BRIEFING_GONE
    return dbFailure(error, "Não foi possível pedir a análise.")
  }
  revalidatePath(`/clientes/${clientId}`)
  revalidatePath("/briefing", "layout")
  return { ok: true, data: null }
}
