import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { MCP_PATH, RESOURCE_METADATA_PATH } from "@/features/mcp/oauth"
import type { Database } from "@/lib/supabase/database.types"
import { supabaseEnv } from "@/lib/supabase/env"
import type { DateKey } from "@/lib/types"

/*
 * Quem chama o /api/mcp. O Claude manda o token que o servidor OAuth do
 * Supabase emitiu para a pessoa (Authorization: Bearer). O cliente do
 * Supabase daqui usa esse token com a chave publicável, então o RLS vale
 * como no app: sem service role e sem chave secreta.
 */

export type McpSupabase = SupabaseClient<Database>

export interface McpUser {
  id: string
  email: string
  full_name: string
}

/** O que cada ferramenta recebe: o banco com o token da pessoa, quem é, o endereço do app e o dia. */
export interface McpContext {
  supabase: McpSupabase
  user: McpUser
  /** Origem do app (para os links), ex.: https://admin.deumboop.com.br */
  origin: string
  today: DateKey
}

export type McpAuth =
  | { ok: true; supabase: McpSupabase; user: McpUser }
  | { ok: false; status: 401 | 403; error: "invalid_token" | "missing_token" | "not_team"; message: string }

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  const match = header?.match(/^Bearer\s+([\w.~+/-]+=*)$/i)
  return match?.[1] ?? null
}

export async function authenticate(request: Request): Promise<McpAuth> {
  const token = bearerToken(request)
  if (!token) return { ok: false, status: 401, error: "missing_token", message: "Conecte o Boop Admin no Claude para continuar." }

  const { url, publishableKey } = supabaseEnv()
  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Confere a assinatura e a validade do token (pela chave pública do
  // projeto ou, com chave simétrica, perguntando ao Supabase Auth). Um token
  // malformado faz o getClaims lançar, em vez de devolver o erro.
  const invalid = { ok: false, status: 401, error: "invalid_token", message: "Sessão do Claude expirada. Conecte de novo." } as const
  const { data, error } = await supabase.auth.getClaims(token).catch(() => ({ data: null, error: true }))
  if (error || !data?.claims || data.claims.role !== "authenticated") return invalid

  // Ser da equipe = ter perfil. Conta de cliente (portal) não usa o conector.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", data.claims.sub)
    .maybeSingle()
  if (!profile) {
    return { ok: false, status: 403, error: "not_team", message: "O conector do Claude é só para a equipe da Boop." }
  }

  return {
    ok: true,
    supabase,
    user: {
      id: profile.id,
      full_name: profile.full_name,
      email: typeof data.claims.email === "string" ? data.claims.email : "",
    },
  }
}

/** Endereço público do servidor MCP e dos metadados, a partir da requisição. */
export function mcpUrls(origin: string): { resource: string; metadata: string } {
  return { resource: `${origin}${MCP_PATH}`, metadata: `${origin}${RESOURCE_METADATA_PATH}` }
}

/**
 * Cabeçalho do 401: aponta para os metadados do recurso protegido (RFC 9728),
 * de onde o Claude descobre o servidor OAuth do Supabase e começa o login.
 */
export function wwwAuthenticate(origin: string, failure: Extract<McpAuth, { ok: false }>): string {
  const parts = [`resource_metadata="${mcpUrls(origin).metadata}"`]
  if (failure.error === "invalid_token") parts.unshift('error="invalid_token"')
  return `Bearer ${parts.join(", ")}`
}

/** Emissor do Supabase Auth (o "authorization server" dos metadados). */
export function authorizationServer(): string {
  return `${supabaseEnv().url.replace(/\/+$/, "")}/auth/v1`
}
