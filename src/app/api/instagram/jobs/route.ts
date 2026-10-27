import { after } from "next/server"

import { instagramJobsSecret } from "@/features/instagram/config"
import { sameText } from "@/features/instagram/logic"
import { refreshLongToken } from "@/features/instagram/meta"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"

/**
 * Jobs do Instagram, chamados só pelo banco (pg_cron → pg_net; veja a
 * migration instagram_accounts). Vem sem sessão: vale o segredo compartilhado
 * (INSTAGRAM_JOBS_SECRET aqui, `instagram_jobs_secret` no Vault), que as
 * funções do banco conferem de novo. Responde na hora e trabalha depois
 * (`after`), para o pg_net não esperar.
 *
 * Hoje: `refresh_tokens` renova os tokens longos que vencem em até 15 dias.
 * Os próximos PRs entram aqui (publicar, métricas).
 */

export const maxDuration = 60

const JOBS = ["refresh_tokens"] as const
type Job = (typeof JOBS)[number]

async function refreshTokens(supabase: SupabaseServerClient, secret: string) {
  const { data, error } = await supabase.rpc("instagram_tokens_to_refresh", { p_secret: secret })
  if (error) {
    console.error(`[instagram] tokens a renovar: ${error.message}`)
    return
  }
  let refreshed = 0
  for (const row of data) {
    const result = await refreshLongToken(row.access_token)
    const { error: saveError } = result.ok
      ? await supabase.rpc("instagram_token_refreshed", {
          p_secret: secret,
          p_account_id: row.account_id,
          p_access_token: result.value.accessToken,
          p_expires_in: result.value.expiresIn,
        })
      : await supabase.rpc("instagram_token_failed", {
          p_secret: secret,
          p_account_id: row.account_id,
          p_error: result.error,
          p_expired: result.invalidToken,
        })
    if (saveError) console.error(`[instagram] renovação ${row.account_id}: ${saveError.message}`)
    else if (result.ok) refreshed++
    else console.error(`[instagram] renovação ${row.account_id}: ${result.error}`)
  }
  console.info(`[instagram] tokens renovados: ${refreshed} de ${data.length}`)
}

export async function POST(request: Request) {
  const secret = instagramJobsSecret()
  if (!secret) return Response.json({ error: "Jobs do Instagram não configurados." }, { status: 503 })

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!sameText(given, secret)) return Response.json({ error: "Não autorizado." }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const job = body && typeof body === "object" ? (body as { job?: unknown }).job : null
  if (!JOBS.includes(job as Job)) return Response.json({ error: "Job desconhecido." }, { status: 400 })

  const supabase = await createClient()
  after(() => refreshTokens(supabase, secret))

  return Response.json({ accepted: job }, { status: 202, headers: { "Cache-Control": "no-store" } })
}
