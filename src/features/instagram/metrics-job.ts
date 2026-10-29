import "server-only"

import { insightsFor, mediaFields, mediaInsights } from "@/features/instagram/meta"
import {
  COMMON_METRICS,
  EMPTY_VALUES,
  MEDIA_FIELDS,
  mediaKind,
  metricValues,
  NOT_ENOUGH_VIEWERS_CODE,
  pickDue,
  type Checkpoint,
  type MetricsCandidate,
  type MetricValues,
} from "@/features/instagram/metrics-logic"
import type { Json } from "@/lib/supabase/database.types"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Job `collect_metrics` (de hora em hora, pelo pg_cron; veja a migration
 * instagram_metrics). Pede ao banco os posts que ainda podem ter leitura,
 * escolhe os que venceram (metrics-logic.ts: stories primeiro, até 20 por
 * rodada), lê na Meta os campos da publicação e as métricas do tipo e grava.
 *
 * Erro da Meta (publicação apagada, story com menos de 5 visualizações) grava
 * a leitura com o erro, para não insistir no mesmo momento. Sem resposta, não
 * grava: tenta na próxima rodada. Token recusado deixa a conta "vencida",
 * como na publicação.
 */

/** Sem esse tempo de sobra na rodada, o post fica para a próxima. */
const POST_BUDGET_MS = 25_000

type Reading =
  | { kind: "saved"; values: MetricValues; mediaKind: ReturnType<typeof mediaKind>; raw: Json; error: string | null }
  | { kind: "skip"; invalidToken?: boolean; error: string }

async function readOne(candidate: MetricsCandidate, token: string): Promise<Reading> {
  const fields = await mediaFields(candidate.media_id, token, MEDIA_FIELDS)
  if (!fields.ok) {
    if (fields.network || fields.invalidToken) return { kind: "skip", invalidToken: fields.invalidToken, error: fields.error }
    return {
      kind: "saved",
      values: EMPTY_VALUES,
      mediaKind: mediaKind(candidate.format),
      raw: { error: fields.error },
      error: `O Instagram não devolveu a publicação: ${fields.error}`,
    }
  }
  const kind = mediaKind(candidate.format, fields.value.fields.mediaType)

  let insights = await insightsFor(candidate.media_id, token, kind)
  // Uma métrica recusada derruba o pedido todo: tenta só as que valem para todos os tipos.
  if (!insights.ok && !insights.network && !insights.invalidToken && insights.code !== NOT_ENOUGH_VIEWERS_CODE) {
    insights = await mediaInsights(candidate.media_id, token, COMMON_METRICS)
  }
  if (!insights.ok && (insights.network || insights.invalidToken)) {
    return { kind: "skip", invalidToken: insights.invalidToken, error: insights.error }
  }

  const raw = { media: fields.value.raw, insights: insights.ok ? insights.value.raw : { error: insights.error } } as Json
  if (!insights.ok) {
    return {
      kind: "saved",
      values: metricValues(fields.value.fields, null),
      mediaKind: kind,
      raw,
      error:
        insights.code === NOT_ENOUGH_VIEWERS_CODE
          ? "Menos de 5 visualizações: o Instagram não mostra as métricas."
          : `O Instagram não devolveu as métricas: ${insights.error}`,
    }
  }
  return { kind: "saved", values: metricValues(fields.value.fields, insights.value.values), mediaKind: kind, raw, error: null }
}

async function save(
  supabase: SupabaseServerClient,
  secret: string,
  candidate: MetricsCandidate,
  checkpoint: Checkpoint,
  reading: Extract<Reading, { kind: "saved" }>
) {
  const { error } = await supabase.rpc("instagram_metrics_save", {
    p_secret: secret,
    p_post_id: candidate.post_id,
    p_media_id: candidate.media_id,
    p_checkpoint: checkpoint,
    p_media_kind: reading.mediaKind,
    p_metrics: { ...reading.values },
    p_raw: reading.raw,
    // O gerador de tipos marca todo argumento como obrigatório; a função aceita null.
    p_error: reading.error as string,
  })
  if (error) console.error(`[instagram] métricas ${candidate.post_id}: ${error.message}`)
  return !error
}

export async function collectMetrics(supabase: SupabaseServerClient, secret: string, deadline: number) {
  const { data, error } = await supabase.rpc("instagram_metrics_due", { p_secret: secret })
  if (error) {
    console.error(`[instagram] posts para medir: ${error.message}`)
    return
  }
  const due = pickDue(data as MetricsCandidate[], Date.now())
  // Um token por cliente; null quando a conta não vale (ou ficou vencida nesta rodada).
  const tokens = new Map<string, { accountId: string; token: string } | null>()
  const counts = { saved: 0, errors: 0, skipped: 0 }

  for (const { candidate, checkpoint } of due) {
    if (Date.now() + POST_BUDGET_MS > deadline) {
      counts.skipped++
      continue
    }
    if (!tokens.has(candidate.client_id)) {
      const { data: accounts, error: tokenError } = await supabase.rpc("instagram_account_token", {
        p_secret: secret,
        p_client_id: candidate.client_id,
      })
      if (tokenError) console.error(`[instagram] token ${candidate.client_id}: ${tokenError.message}`)
      const account = accounts?.[0]
      tokens.set(candidate.client_id, account ? { accountId: account.account_id, token: account.access_token } : null)
    }
    const account = tokens.get(candidate.client_id)
    if (!account) {
      counts.skipped++
      continue
    }

    const reading = await readOne(candidate, account.token).catch(
      (failure: unknown): Reading => ({ kind: "skip", error: failure instanceof Error ? failure.message : String(failure) })
    )
    if (reading.kind === "skip") {
      counts.skipped++
      console.error(`[instagram] métricas ${candidate.post_id}: ${reading.error}`)
      if (reading.invalidToken) {
        tokens.set(candidate.client_id, null)
        const { error: accountError } = await supabase.rpc("instagram_token_failed", {
          p_secret: secret,
          p_account_id: account.accountId,
          p_error: reading.error,
          p_expired: true,
        })
        if (accountError) console.error(`[instagram] conta ${account.accountId}: ${accountError.message}`)
      }
      continue
    }
    if (await save(supabase, secret, candidate, checkpoint, reading)) {
      if (reading.error) counts.errors++
      else counts.saved++
    }
  }
  console.info(
    `[instagram] métricas: ${counts.saved} leituras, ${counts.errors} com erro da Meta, ${counts.skipped} para a próxima rodada (de ${due.length} vencidas)`
  )
}
