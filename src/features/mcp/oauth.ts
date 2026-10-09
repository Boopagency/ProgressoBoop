/*
 * Endereços e regras do conector do Claude (MCP). Funções puras: usadas pelo
 * proxy, pelo login, pela tela de autorização e pela rota /api/mcp.
 *
 * O login é o servidor OAuth 2.1 do Supabase Auth: o Claude se registra lá
 * (registro dinâmico), o Supabase manda a pessoa para CONSENT_PATH com um
 * `authorization_id`, ela permite e o Supabase entrega ao Claude o token da
 * pessoa. A rota /api/mcp usa esse token com o RLS, como o resto do app.
 */

/** Endereço do servidor MCP (o que a pessoa cola no Claude). */
export const MCP_PATH = "/api/mcp"

/** Tela de autorização: Supabase → Authentication → OAuth Server → Authorization Path. */
export const CONSENT_PATH = "/oauth/consent"

/**
 * Metadados do recurso protegido (RFC 9728). O Claude lê o endereço que vem
 * no `WWW-Authenticate` do 401; o da raiz fica para clientes que procuram lá.
 */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`
export const RESOURCE_METADATA_PATHS = [RESOURCE_METADATA_PATH, "/.well-known/oauth-protected-resource"] as const

/** Onde a pessoa adiciona o conector no Claude. */
export const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors"

/** Callbacks do Claude na web, no app e no celular (o segundo é o futuro endereço). */
const CLAUDE_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
])

/** Claude Code: callback no próprio computador, numa porta que muda a cada sessão. */
const LOOPBACK_CALLBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/callback$/

export type RedirectKind = "claude" | "claude_code" | "unknown"

/**
 * Para onde o Supabase manda o código depois do "Permitir". Só o Claude é
 * aceito: o registro dinâmico deixa qualquer aplicativo se registrar, então
 * a tela de autorização é quem barra os outros.
 */
export function redirectKind(redirectUri: string): RedirectKind {
  if (CLAUDE_CALLBACKS.has(redirectUri)) return "claude"
  if (LOOPBACK_CALLBACK.test(redirectUri)) return "claude_code"
  return "unknown"
}

/** Host para mostrar na tela ("claude.ai", "localhost:3118"). */
export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host
  } catch {
    return redirectUri
  }
}

/** O `authorization_id` do Supabase vai na URL: só caracteres seguros. */
export function isAuthorizationId(value: unknown): value is string {
  return typeof value === "string" && /^[\w.~-]{1,256}$/.test(value)
}

export function consentPath(authorizationId: string): string {
  return `${CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`
}

/**
 * Volta depois do login (`/login?next=…`). Só a tela de autorização entra,
 * para o parâmetro não virar um redirecionamento aberto.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const prefix = `${CONSENT_PATH}?authorization_id=`
  if (!value.startsWith(prefix)) return null
  let id: string
  try {
    id = decodeURIComponent(value.slice(prefix.length))
  } catch {
    return null
  }
  return isAuthorizationId(id) ? consentPath(id) : null
}
