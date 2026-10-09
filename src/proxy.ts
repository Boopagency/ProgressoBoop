import { NextResponse, type NextRequest } from "next/server"

import { CONSENT_PATH, MCP_PATH, RESOURCE_METADATA_PATHS } from "@/features/mcp/oauth"
import { updateSession } from "@/lib/supabase/proxy"

/**
 * Renova a sessão e protege as rotas: sem sessão válida, tudo vai para
 * /login. A verificação completa (sessão + ser da equipe) acontece no
 * servidor, em requireUser, em cada página, query e action. Quem já está
 * logado e abre /login é redirecionado pela própria página, que confere o
 * perfil (redirecionar aqui criaria um loop para contas sem perfil).
 *
 * Rotas públicas: o login, a visita diária ao banco (cron da Vercel) e o
 * conector do Claude, que se autentica pelo token (Authorization: Bearer) e
 * responde 401 com o endereço dos metadados do OAuth.
 */
const PUBLIC_PATHS = new Set(["/login", "/api/keepalive", MCP_PATH, ...RESOURCE_METADATA_PATHS])

export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request)

  if (!isAuthenticated && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    // Quem vem do Claude volta para a tela de autorização depois de entrar.
    if (request.nextUrl.pathname === CONSENT_PATH) {
      url.searchParams.set("next", `${CONSENT_PATH}${request.nextUrl.search}`)
    }
    const redirect = NextResponse.redirect(url)
    // Mantém cookies de sessão que o Supabase tenha limpado/renovado.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  return response
}

export const config = {
  // Fora: arquivos do Next e estáticos (logo, ícones), que o login também usa.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
