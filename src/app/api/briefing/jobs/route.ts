import { after } from "next/server"

import { briefingAiKeys, briefingJobsSecret } from "@/features/briefing/ai-config"
import { processBriefingJobs } from "@/features/briefing/jobs"
import { sameText } from "@/features/instagram/logic"
import { supabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

/**
 * Transcrição e resumo do briefing, chamados só pelo banco (pg_cron → pg_net,
 * a cada minuto e só quando há algo pendente; veja a migration
 * briefing_transcription). Vem sem sessão: vale o segredo compartilhado
 * (BRIEFING_JOBS_SECRET aqui, `briefing_jobs_secret` no Vault), que as funções
 * do banco conferem de novo. Responde na hora e trabalha depois (`after`),
 * para o pg_net não esperar.
 */

export const maxDuration = 60

export async function POST(request: Request) {
  const secret = briefingJobsSecret()
  if (!secret) return Response.json({ error: "Jobs do briefing não configurados." }, { status: 503 })

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!sameText(given, secret)) return Response.json({ error: "Não autorizado." }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const job = body && typeof body === "object" ? (body as { job?: unknown }).job : null
  if (job !== "process") return Response.json({ error: "Job desconhecido." }, { status: 400 })

  // Folga para gravar o resultado antes do limite da função.
  const deadline = Date.now() + (maxDuration - 8) * 1000
  const keys = briefingAiKeys()
  const supabase = await createClient()
  after(() => processBriefingJobs({ supabase, secret, keys, supabaseUrl: supabaseEnv().url, deadline }))

  return Response.json({ accepted: job }, { status: 202, headers: { "Cache-Control": "no-store" } })
}
