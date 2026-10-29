import "server-only"

import {
  containerStatus,
  createContainer,
  mediaPermalink,
  publishContainer,
  publishingLimit,
} from "@/features/instagram/meta"
import { canReuseContainer, containerPlan, publishKind, withChildren } from "@/features/instagram/publish-logic"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ContentFormat } from "@/lib/types"

/*
 * Job `publish_due` (a cada 5 minutos, pelo pg_cron; veja a migration
 * instagram_publish). Para cada post que venceu: cria os contêineres na Meta
 * com as URLs assinadas guardadas ao agendar, espera o status FINISHED,
 * confere o limite de posts em 24 h, publica, lê o link e grava. Falha conta
 * tentativa (até 3, e o banco avisa a equipe na última); a Meta ainda
 * processando, o limite atingido ou o tempo da rodada acabando deixam para a
 * próxima rodada sem contar tentativa, com o contêiner guardado.
 */

type DueRow = {
  post_id: string
  client_id: string
  format: string
  caption: string | null
  media_urls: string[]
  container_id: string | null
  container_created_at: string | null
}

type Outcome =
  | { kind: "published"; mediaId: string; permalink: string | null }
  | { kind: "failed"; error: string; final: boolean; invalidToken?: boolean }
  | { kind: "deferred"; containerId: string | null; note: string | null }

/** De quanto em quanto tempo confere o status do contêiner, e por quanto tempo no máximo, por post. */
const POLL_MS = 3_000
const POLL_MAX_MS = 20_000
/** Sem esse tempo de sobra na rodada, o post fica para a próxima. */
const POST_BUDGET_MS = 25_000

/** Erro da Meta: token recusado não adianta tentar de novo (e a conta fica vencida). */
function metaFailure(result: { error: string; invalidToken: boolean }): Outcome {
  return { kind: "failed", error: result.error, final: result.invalidToken, invalidToken: result.invalidToken }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Espera o contêiner ficar pronto (FINISHED), até o limite; devolve o último status ou o erro. */
async function waitForContainer(containerId: string, token: string, until: number) {
  for (;;) {
    const status = await containerStatus(containerId, token)
    if (!status.ok || status.value !== "IN_PROGRESS" || Date.now() + POLL_MS > until) return status
    await sleep(POLL_MS)
  }
}

async function publishOne(row: DueRow, account: { userId: string; token: string }, deadline: number): Promise<Outcome> {
  const kind = publishKind(row.format as ContentFormat)
  if (!kind) return { kind: "failed", error: "Esse formato não publica sozinho.", final: true }
  const { userId, token } = account
  const until = Math.min(Date.now() + POLL_MAX_MS, deadline)

  // Contêiner de uma rodada anterior: publica se ficou pronto; senão, começa de novo.
  let containerId = canReuseContainer(row.container_created_at, Date.now()) ? row.container_id : null
  if (containerId) {
    const status = await waitForContainer(containerId, token, until)
    if (status.ok && status.value === "IN_PROGRESS") {
      return { kind: "deferred", containerId, note: "Esperando o Instagram terminar de processar as imagens." }
    }
    if (status.ok && status.value === "PUBLISHED") {
      return { kind: "failed", error: "O Instagram diz que esse post já foi publicado. Confira no perfil do cliente.", final: true }
    }
    if (!status.ok || status.value !== "FINISHED") containerId = null
  }

  if (!containerId) {
    const plan = containerPlan(kind, row.media_urls, row.caption)
    const childIds: string[] = []
    for (const child of plan.children) {
      const created = await createContainer(userId, token, child)
      if (!created.ok) return metaFailure(created)
      childIds.push(created.value)
    }
    const parent = await createContainer(userId, token, kind === "carousel" ? withChildren(plan.parent, childIds) : plan.parent)
    if (!parent.ok) return metaFailure(parent)
    containerId = parent.value

    const status = await waitForContainer(containerId, token, until)
    if (!status.ok || status.value === "IN_PROGRESS") {
      return { kind: "deferred", containerId, note: "Esperando o Instagram terminar de processar as imagens." }
    }
    if (status.value !== "FINISHED") {
      return {
        kind: "failed",
        error: "O Instagram não aceitou as imagens (erro ao processar o contêiner). Confira o formato e a proporção.",
        final: false,
      }
    }
  }

  const limit = await publishingLimit(userId, token)
  if (limit.ok && limit.value.usage >= limit.value.total) {
    return {
      kind: "deferred",
      containerId,
      note: `A conta atingiu o limite de ${limit.value.total} posts pela API em 24 horas. Tenta de novo nas próximas rodadas.`,
    }
  }

  const published = await publishContainer(userId, token, containerId)
  if (!published.ok) {
    // Sem resposta, o post pode ter saído: não tenta de novo para não publicar duas vezes.
    if (published.network) {
      return {
        kind: "failed",
        error: `O Instagram não respondeu ao publicar (${published.error}). Confira no perfil do cliente se o post saiu antes de tentar de novo.`,
        final: true,
      }
    }
    return metaFailure(published)
  }

  const permalink = await mediaPermalink(published.value, token)
  return { kind: "published", mediaId: published.value, permalink: permalink.ok ? permalink.value : null }
}

async function record(supabase: SupabaseServerClient, secret: string, row: DueRow, outcome: Outcome) {
  const { error } =
    outcome.kind === "published"
      ? await supabase.rpc("instagram_post_published", {
          p_secret: secret,
          p_post_id: row.post_id,
          p_media_id: outcome.mediaId,
          p_permalink: outcome.permalink ?? "",
        })
      : outcome.kind === "failed"
        ? await supabase.rpc("instagram_post_failed", {
            p_secret: secret,
            p_post_id: row.post_id,
            p_error: outcome.error,
            p_final: outcome.final,
          })
        : await supabase.rpc("instagram_post_deferred", {
            p_secret: secret,
            p_post_id: row.post_id,
            // O gerador de tipos marca todo argumento como obrigatório; a função aceita null nos dois.
            p_container_id: outcome.containerId as string,
            p_note: outcome.note as string,
          })
  if (error) console.error(`[instagram] publicação ${row.post_id}: ${error.message}`)
}

export async function publishDue(supabase: SupabaseServerClient, secret: string, deadline: number) {
  const { data, error } = await supabase.rpc("instagram_posts_due", { p_secret: secret })
  if (error) {
    console.error(`[instagram] posts a publicar: ${error.message}`)
    return
  }
  const counts = { published: 0, failed: 0, deferred: 0 }
  for (const row of data as DueRow[]) {
    let outcome: Outcome
    if (Date.now() + POST_BUDGET_MS > deadline) {
      outcome = { kind: "deferred", containerId: row.container_id, note: null }
    } else {
      const { data: accounts, error: tokenError } = await supabase.rpc("instagram_account_token", {
        p_secret: secret,
        p_client_id: row.client_id,
      })
      const account = accounts?.[0]
      if (tokenError) {
        console.error(`[instagram] token ${row.client_id}: ${tokenError.message}`)
        outcome = { kind: "deferred", containerId: row.container_id, note: null }
      } else if (!account) {
        outcome = {
          kind: "failed",
          error: "O Instagram do cliente não está conectado (ou a conexão venceu). Conecte de novo e tente outra vez.",
          final: true,
        }
      } else {
        outcome = await publishOne(row, { userId: account.external_user_id, token: account.access_token }, deadline).catch(
          (failure: unknown) => ({
            kind: "failed" as const,
            error: failure instanceof Error ? failure.message : String(failure),
            final: true,
          })
        )
        // Token recusado pela Meta: a conta fica "vencida" até reconectar (como na renovação).
        if (outcome.kind === "failed" && outcome.invalidToken) {
          const { error: accountError } = await supabase.rpc("instagram_token_failed", {
            p_secret: secret,
            p_account_id: account.account_id,
            p_error: outcome.error,
            p_expired: true,
          })
          if (accountError) console.error(`[instagram] conta ${account.account_id}: ${accountError.message}`)
        }
      }
    }
    await record(supabase, secret, row, outcome)
    counts[outcome.kind]++
  }
  console.info(
    `[instagram] publicação: ${counts.published} publicados, ${counts.failed} com falha, ${counts.deferred} para a próxima rodada (de ${data.length})`
  )
}
