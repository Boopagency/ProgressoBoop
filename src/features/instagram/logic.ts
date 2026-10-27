import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/*
 * Regras puras da conexão com o Instagram ("API do Instagram com login do
 * Instagram", Meta). Sem React e sem banco; só no servidor (node:crypto).
 * Teste: `node --test src/features/instagram/logic.test.mjs`.
 */

export const INSTAGRAM_API_VERSION = "v26.0"
export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
export const INSTAGRAM_GRAPH_URL = "https://graph.instagram.com"

/** Pedidos de uma vez, para o cliente autorizar uma vez só: leitura, publicação e métricas. */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const
export type InstagramScope = (typeof INSTAGRAM_SCOPES)[number]

/** Caminhos das rotas do OAuth (a URL de retorno é cadastrada no app da Meta). */
export const CONNECT_PATH = "/api/instagram/conectar"
export const CALLBACK_PATH = "/api/instagram/retorno"
/** Cookie que amarra o `state` ao navegador que começou a conexão. */
export const STATE_COOKIE = "boop_ig_state"
/** Quanto tempo a pessoa tem para autorizar na Meta e voltar. */
export const STATE_TTL_MS = 10 * 60 * 1000

/** De onde a conexão começou e para onde volta. */
export type ConnectOrigin = "admin" | "portal"

export interface StatePayload {
  /** Quem começou (auth.uid()). */
  userId: string
  clientId: string
  origin: ConnectOrigin
  /** Aleatório; o mesmo valor vai no cookie. */
  nonce: string
  /** Validade, em milissegundos desde 1970. */
  expiresAt: number
}

export type StateCheck =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "signature" }
  /** Assinatura certa, mas passou da validade: o payload serve só para saber para onde voltar. */
  | { ok: false; reason: "expired"; payload: StatePayload }

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

/** Chave própria do `state`, derivada da chave secreta do app (não reusa a chave crua). */
export function stateKey(appSecret: string): Buffer {
  return createHmac("sha256", appSecret).update("boop-admin:instagram-state").digest()
}

function sign(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(body).digest("base64url")
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url")
}

/** `state` assinado: `<payload em base64url>.<HMAC-SHA256>`. */
export function signState(payload: StatePayload, key: Buffer): string {
  const body = base64url(
    JSON.stringify({ u: payload.userId, c: payload.clientId, o: payload.origin, n: payload.nonce, x: payload.expiresAt })
  )
  return `${body}.${sign(body, key)}`
}

/** Confere assinatura e validade do `state` que volta da Meta. */
export function verifyState(token: string, key: Buffer, now: number): StateCheck {
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" }
  const [body, given] = parts as [string, string]
  const expected = Buffer.from(sign(body, key))
  const actual = Buffer.from(given)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "signature" }
  }
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "malformed" }
  const { u, c, o, n, x } = raw as Record<string, unknown>
  if (
    typeof u !== "string" ||
    typeof c !== "string" ||
    (o !== "admin" && o !== "portal") ||
    typeof n !== "string" ||
    typeof x !== "number"
  ) {
    return { ok: false, reason: "malformed" }
  }
  const payload: StatePayload = { userId: u, clientId: c, origin: o, nonce: n, expiresAt: x }
  if (x <= now) return { ok: false, reason: "expired", payload }
  return { ok: true, payload }
}

/** Compara dois textos sem vazar pelo tempo (nonce do cookie, segredo dos jobs). */
export function sameText(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Endereço da tela de autorização do Instagram. */
export function authorizeUrl({ appId, redirectUri, state }: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_URL)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","))
  url.searchParams.set("state", state)
  return url.toString()
}

/** O código volta às vezes com `#_` no fim, que não faz parte dele. */
export function cleanCode(code: string): string {
  return code.replace(/#_$/, "")
}

/** Conta profissional (Empresa ou Criador) no formato do banco; conta pessoal dá null. */
export function professionalAccountType(value: unknown): "business" | "media_creator" | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized === "business" || normalized === "media_creator" ? normalized : null
}

/** Permissões autorizadas: a Meta manda texto separado por vírgula ou lista. */
export function parsePermissions(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  return [...new Set(list.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
}

/** Escopos que pedimos e a pessoa desmarcou na tela da Meta. */
export function missingScopes(permissions: readonly string[]): InstagramScope[] {
  return INSTAGRAM_SCOPES.filter((scope) => !permissions.includes(scope))
}

export interface ShortToken {
  accessToken: string
  userId: string
  permissions: string[]
}

/** Resposta da troca do código. A documentação mostra `{ data: [...] }`; na prática vem solta. */
export function parseShortToken(json: unknown): ShortToken | null {
  if (!json || typeof json !== "object") return null
  const data = (json as { data?: unknown }).data
  const row = (Array.isArray(data) ? data[0] : json) as Record<string, unknown> | undefined
  if (!row || typeof row.access_token !== "string" || !row.access_token) return null
  const userId = typeof row.user_id === "number" || typeof row.user_id === "string" ? String(row.user_id) : ""
  return { accessToken: row.access_token, userId, permissions: parsePermissions(row.permissions) }
}

export interface LongToken {
  accessToken: string
  expiresIn: number
}

/** Token longo (troca ou renovação): `access_token` e `expires_in` em segundos. */
export function parseLongToken(json: unknown): LongToken | null {
  if (!json || typeof json !== "object") return null
  const { access_token, expires_in } = json as Record<string, unknown>
  if (typeof access_token !== "string" || !access_token) return null
  if (typeof expires_in !== "number" || !Number.isFinite(expires_in) || expires_in <= 0) return null
  return { accessToken: access_token, expiresIn: Math.floor(expires_in) }
}

export interface InstagramProfile {
  userId: string
  username: string
  name: string | null
  accountType: "business" | "media_creator" | null
  pictureUrl: string | null
}

/** O /me da conta: id profissional, @, nome, tipo e foto. */
export function parseProfile(json: unknown): InstagramProfile | null {
  if (!json || typeof json !== "object") return null
  const row = json as Record<string, unknown>
  const id = row.user_id ?? row.id
  const userId = typeof id === "number" || typeof id === "string" ? String(id) : ""
  const username = typeof row.username === "string" ? row.username.trim() : ""
  if (!userId || !/^[A-Za-z0-9._]{1,30}$/.test(username)) return null
  const picture = typeof row.profile_picture_url === "string" && row.profile_picture_url.startsWith("https://") ? row.profile_picture_url : null
  return {
    userId: userId.slice(0, 64),
    username,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 120) : null,
    accountType: professionalAccountType(row.account_type),
    pictureUrl: picture && picture.length <= 2000 ? picture : null,
  }
}

/** Erro da Graph API que diz que o token não vale mais (OAuthException 190). */
export function isInvalidTokenError(json: unknown): boolean {
  if (!json || typeof json !== "object") return false
  const error = (json as { error?: { code?: unknown } }).error
  return Boolean(error && error.code === 190)
}

/** Mensagem curta do erro da Meta, para guardar no banco (sem token). */
export function metaErrorMessage(json: unknown, status: number): string {
  const error = json && typeof json === "object" ? (json as { error?: unknown }).error : null
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : typeof (json as { error_message?: unknown } | null)?.error_message === "string"
        ? (json as { error_message: string }).error_message
        : `HTTP ${status}`
  return message.slice(0, 500)
}

/** Resultado da volta do OAuth, no `?instagram=` da tela. */
export const CONNECT_NOTICES = [
  "conectado",
  "cancelado",
  "pessoal",
  "expirou",
  "sem-acesso",
  "nao-configurado",
  "erro",
] as const
export type ConnectNotice = (typeof CONNECT_NOTICES)[number]

const NOTICE_TEXT: Record<ConnectNotice, { tone: "success" | "error"; text: string }> = {
  conectado: { tone: "success", text: "Instagram conectado." },
  cancelado: { tone: "error", text: "A conexão foi cancelada na tela do Instagram. Nada mudou." },
  pessoal: {
    tone: "error",
    text: "Essa é uma conta pessoal. Mude para conta profissional (Empresa ou Criador de conteúdo) no app do Instagram, em Configurações → Tipo de conta, e conecte de novo.",
  },
  expirou: { tone: "error", text: "A conexão demorou demais ou foi aberta em outro navegador. Tente de novo." },
  "sem-acesso": { tone: "error", text: "Você não tem acesso a esse cliente." },
  "nao-configurado": { tone: "error", text: "Integração com o Instagram não configurada." },
  erro: { tone: "error", text: "Não foi possível conectar o Instagram. Tente de novo em instantes." },
}

/** Aviso a mostrar no cartão a partir do `?instagram=`; null quando não há. */
export function connectNotice(value: unknown): { tone: "success" | "error"; text: string } | null {
  return CONNECT_NOTICES.includes(value as ConnectNotice) ? NOTICE_TEXT[value as ConnectNotice] : null
}

/** Para onde a pessoa volta depois do OAuth. */
export function returnPath(origin: ConnectOrigin, clientId: string, notice: ConnectNotice): string {
  const query = new URLSearchParams({ instagram: notice })
  if (origin === "portal") {
    query.set("cliente", clientId)
    return `/portal/feed?${query.toString()}`
  }
  return `/clientes/${clientId}?${query.toString()}#instagram`
}
