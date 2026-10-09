import type { NextRequest } from "next/server"

import { authenticate, wwwAuthenticate } from "@/features/mcp/auth"
import { PARSE_ERROR, handleMessage, rpcError } from "@/features/mcp/protocol"
import { MCP_TOOLS, serverInstructions } from "@/features/mcp/tools"
import { todayKey } from "@/lib/dates"

/**
 * Servidor MCP do Boop Admin (conector personalizado do Claude). Cada pessoa
 * da equipe conecta com a própria conta: o token do OAuth do Supabase chega
 * aqui e todas as consultas rodam com ele, sob o RLS. Sem estado e sem SSE:
 * cada POST traz uma mensagem JSON-RPC e recebe a resposta em JSON.
 */

const BODY_MAX = 1_000_000
const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin
  const auth = await authenticate(request)
  if (!auth.ok) {
    return Response.json(rpcError(null, -32001, auth.message), {
      status: auth.status,
      headers: { ...NO_STORE, ...(auth.status === 401 ? { "WWW-Authenticate": wwwAuthenticate(origin, auth) } : {}) },
    })
  }

  const text = await request.text()
  if (text.length > BODY_MAX) {
    return Response.json(rpcError(null, -32600, "Mensagem grande demais."), { status: 413, headers: NO_STORE })
  }
  let message: unknown
  try {
    message = JSON.parse(text)
  } catch {
    return Response.json(rpcError(null, PARSE_ERROR, "JSON inválido."), { status: 400, headers: NO_STORE })
  }

  const today = todayKey()
  const response = await handleMessage(message, {
    tools: MCP_TOOLS,
    context: { supabase: auth.supabase, user: auth.user, origin, today },
    instructions: serverInstructions(auth.user, today),
  })
  // Só notificações (ex.: notifications/initialized): aceitas, sem corpo.
  if (response === null) return new Response(null, { status: 202, headers: NO_STORE })
  return Response.json(response, { headers: NO_STORE })
}

/** Sem fluxo SSE aberto pelo cliente nem sessão para encerrar. */
function methodNotAllowed() {
  return new Response("Use POST.", { status: 405, headers: { Allow: "POST", ...NO_STORE } })
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
