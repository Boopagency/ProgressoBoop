import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/features/auth/constants"

/**
 * Checagem otimista de sessão: sem cookie, qualquer rota vai para /login.
 * A verificação definitiva acontece no servidor (requireUser) em cada
 * página, query e action. Quem já está logado e abre /login é redirecionado
 * pela própria página, que valida a sessão de verdade (um cookie expirado
 * aqui causaria um loop de redirecionamento).
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE)
  const isLoginPage = request.nextUrl.pathname === "/login"

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
}
