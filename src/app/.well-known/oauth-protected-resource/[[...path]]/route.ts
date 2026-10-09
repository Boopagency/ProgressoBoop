import type { NextRequest } from "next/server"

import { authorizationServer, mcpUrls } from "@/features/mcp/auth"

/**
 * Metadados do recurso protegido (RFC 9728) do servidor MCP. O 401 do
 * /api/mcp aponta para cá, e daqui o Claude acha o servidor OAuth do Supabase
 * Auth (descoberta, registro dinâmico, login e token).
 *
 * Responde em /.well-known/oauth-protected-resource e em
 * /.well-known/oauth-protected-resource/api/mcp.
 */
export async function GET(request: NextRequest, context: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  const { path = [] } = await context.params
  if (path.length > 0 && path.join("/") !== "api/mcp") return new Response("Não encontrado.", { status: 404 })

  return Response.json(
    {
      resource: mcpUrls(request.nextUrl.origin).resource,
      authorization_servers: [authorizationServer()],
      bearer_methods_supported: ["header"],
      resource_name: "Boop Admin",
    },
    { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } }
  )
}
