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

/*
 * Chamadas à Meta (só no servidor). Nenhuma delas registra token em log: os
 * erros guardam só a mensagem da Meta.
 */

const TIMEOUT_MS = 10_000

type MetaResult<T> = { ok: true; value: T } | { ok: false; error: string; invalidToken: boolean }

async function call<T>(input: string, init: RequestInit, parse: (json: unknown) => T | null): Promise<MetaResult<T>> {
  try {
    const response = await fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
    const json: unknown = await response.json().catch(() => null)
    const value = response.ok ? parse(json) : null
    if (value) return { ok: true, value }
    return { ok: false, error: metaErrorMessage(json, response.status), invalidToken: isInvalidTokenError(json) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), invalidToken: false }
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
