import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

/**
 * Renova a sessão e protege as rotas: sem sessão válida, tudo vai para
 * /login. A verificação completa (sessão + ser da equipe) acontece no
 * servidor, em requireUser, em cada página, query e action. Quem já está
 * logado e abre /login é redirecionado pela própria página, que confere o
 * perfil (redirecionar aqui criaria um loop para contas sem perfil).
 */
export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request)

  if (!isAuthenticated && request.nextUrl.pathname !== "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
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
