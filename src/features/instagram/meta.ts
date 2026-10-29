import "server-only"

import {
  INSTAGRAM_API_VERSION,
  INSTAGRAM_GRAPH_URL,
  INSTAGRAM_TOKEN_URL,
  isInvalidTokenError,
  metaErrorMessage,
  parseLongToken,
  parseProfile,
  parseShortToken,
  type InstagramProfile,
  type LongToken,
  type ShortToken,
} from "@/features/instagram/logic"
import {
  INSIGHT_METRICS,
  metaErrorCode,
  parseAccountMedia,
  parseInsights,
  parseMediaFields,
  type AccountMedia,
  type MediaFields,
  type MediaKind,
} from "@/features/instagram/metrics-logic"
import {
  parseContainerStatus,
  parseId,
  parsePermalink,
  parsePublishingLimit,
  type ContainerParams,
  type ContainerStatus,
} from "@/features/instagram/publish-logic"

/*
 * Chamadas à Meta (só no servidor). Nenhuma delas registra token em log: os
 * erros guardam só a mensagem da Meta.
 */

const TIMEOUT_MS = 10_000

/**
 * `network`: sem resposta (tempo esgotado, conexão caiu): não dá para saber se a Meta fez o pedido.
 * `code`: o `error.code` da Meta, quando veio.
 */
type MetaResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; invalidToken: boolean; network?: boolean; code?: number | null }

async function call<T>(input: string, init: RequestInit, parse: (json: unknown) => T | null): Promise<MetaResult<T>> {
  try {
    const response = await fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
    const json: unknown = await response.json().catch(() => null)
    const value = response.ok ? parse(json) : null
    if (value) return { ok: true, value }
    return {
      ok: false,
      error: metaErrorMessage(json, response.status),
      invalidToken: isInvalidTokenError(json),
      code: metaErrorCode(json),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), invalidToken: false, network: true }
  }
}

/** Troca o código do OAuth pelo token curto (1 hora). */
export function exchangeCode(input: {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}): Promise<MetaResult<ShortToken>> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  })
  return call(INSTAGRAM_TOKEN_URL, { method: "POST", body }, parseShortToken)
}

/** Troca o token curto pelo longo (60 dias). */
export function exchangeLongToken(input: { appSecret: string; shortToken: string }): Promise<MetaResult<LongToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_URL}/access_token`)
  url.searchParams.set("grant_type", "ig_exchange_token")
  url.searchParams.set("client_secret", input.appSecret)
  url.searchParams.set("access_token", input.shortToken)
  return call(url.toString(), { method: "GET" }, parseLongToken)
}

/** Renova o token longo (precisa ter mais de 24 h e ainda valer): mais 60 dias. */
export function refreshLongToken(token: string): Promise<MetaResult<LongToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_URL}/refresh_access_token`)
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", token)
  return call(url.toString(), { method: "GET" }, parseLongToken)
}

/** O perfil da conta conectada: id profissional, @, nome, tipo e foto. */
export function fetchProfile(token: string): Promise<MetaResult<InstagramProfile>> {
  const url = new URL(`${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/me`)
  url.searchParams.set("fields", "user_id,username,name,account_type,profile_picture_url")
  url.searchParams.set("access_token", token)
  return call(url.toString(), { method: "GET" }, parseProfile)
}

/* ------------------------------------------------------------------ */
/* Publicação (Content Publishing, API do Instagram com login do Instagram) */
/* ------------------------------------------------------------------ */

function graphUrl(path: string): string {
  return `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${path}`
}

/** POST como nos exemplos da Meta: JSON e o token no cabeçalho `Authorization: Bearer`. */
function postJson(token: string, body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }
}

/** GET com os campos pedidos e o token, como em fetchProfile. */
function getUrl(path: string, token: string, fields: string): string {
  const url = new URL(graphUrl(path))
  url.searchParams.set("fields", fields)
  url.searchParams.set("access_token", token)
  return url.toString()
}

/** Cria um contêiner (POST /{ig-user-id}/media) e devolve o id. */
export function createContainer(userId: string, token: string, params: ContainerParams): Promise<MetaResult<string>> {
  return call(graphUrl(`${userId}/media`), postJson(token, params), parseId)
}

/** Status do contêiner (`status_code`): FINISHED, IN_PROGRESS, ERROR, EXPIRED ou PUBLISHED. */
export function containerStatus(containerId: string, token: string): Promise<MetaResult<ContainerStatus>> {
  return call(getUrl(containerId, token, "status_code"), { method: "GET" }, parseContainerStatus)
}

/** Publica o contêiner (POST /{ig-user-id}/media_publish) e devolve o id do post. */
export function publishContainer(userId: string, token: string, containerId: string): Promise<MetaResult<string>> {
  return call(graphUrl(`${userId}/media_publish`), postJson(token, { creation_id: containerId }), parseId)
}

/** Posts publicados pela API nas últimas 24 h e o limite (content_publishing_limit). */
export function publishingLimit(userId: string, token: string): Promise<MetaResult<{ usage: number; total: number }>> {
  return call(getUrl(`${userId}/content_publishing_limit`, token, "quota_usage,config"), { method: "GET" }, parsePublishingLimit)
}

/** O link público do post publicado. */
export function mediaPermalink(mediaId: string, token: string): Promise<MetaResult<string>> {
  return call(getUrl(mediaId, token, "permalink"), { method: "GET" }, parsePermalink)
}

/* ------------------------------------------------------------------ */
/* Métricas (Insights) e publicações da conta                          */
/* ------------------------------------------------------------------ */

/** Campos da publicação (tipo, curtidas, comentários, link, data), com a resposta como veio. */
export function mediaFields(mediaId: string, token: string, fields: string): Promise<MetaResult<{ fields: MediaFields; raw: unknown }>> {
  return call(getUrl(mediaId, token, fields), { method: "GET" }, (json) => {
    const parsed = parseMediaFields(json)
    return parsed ? { fields: parsed, raw: json } : null
  })
}

/** Métricas da publicação (período `lifetime`), com a resposta como veio. */
export function mediaInsights(
  mediaId: string,
  token: string,
  metrics: readonly string[]
): Promise<MetaResult<{ values: Record<string, number>; raw: unknown }>> {
  const url = new URL(graphUrl(`${mediaId}/insights`))
  url.searchParams.set("metric", metrics.join(","))
  url.searchParams.set("access_token", token)
  return call(url.toString(), { method: "GET" }, (json) => {
    const values = parseInsights(json)
    return values ? { values, raw: json } : null
  })
}

/** As métricas pedidas para o tipo (INSIGHT_METRICS). */
export function insightsFor(mediaId: string, token: string, kind: MediaKind) {
  return mediaInsights(mediaId, token, INSIGHT_METRICS[kind])
}

/** Publicações recentes da conta (sem stories: a Meta os lista em outro endpoint). */
export function accountMedia(userId: string, token: string, fields: string, limit: number): Promise<MetaResult<AccountMedia[]>> {
  const url = new URL(getUrl(`${userId}/media`, token, fields))
  url.searchParams.set("limit", String(limit))
  return call(url.toString(), { method: "GET" }, parseAccountMedia)
}
