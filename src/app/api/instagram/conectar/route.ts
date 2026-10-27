import { NextResponse, type NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { instagramApp } from "@/features/instagram/config"
import {
  authorizeUrl,
  CALLBACK_PATH,
  newNonce,
  returnPath,
  signState,
  STATE_COOKIE,
  STATE_TTL_MS,
  stateKey,
  type ConnectOrigin,
} from "@/features/instagram/logic"
import { getPortalUser } from "@/features/portal/session"
import { isUuid } from "@/lib/utils"

/**
 * "Conectar Instagram" (cartão do cliente e do portal): confere quem é
 * (equipe, ou conta daquele cliente), monta o `state` assinado e amarrado à
 * pessoa e ao cliente, guarda o nonce num cookie deste navegador e manda para
 * a tela de autorização do Instagram. A URL de retorno sai da origem da
 * requisição (produção ou prévia), e precisa estar cadastrada no app da Meta.
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("cliente")
  const team = await getSessionUser()
  const portal = team ? null : await getPortalUser()
  const origin: ConnectOrigin = team ? "admin" : "portal"
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (!isUuid(clientId)) return back(team ? "/clientes" : "/portal")
  if (!team && !portal?.clients.some((client) => client.id === clientId)) {
    return back(portal ? returnPath("portal", portal.clients[0]?.id ?? clientId, "sem-acesso") : "/login")
  }
  const userId = team?.id ?? portal?.id
  if (!userId) return back("/login")

  const app = instagramApp()
  if (!app) return back(returnPath(origin, clientId, "nao-configurado"))

  const nonce = newNonce()
  const state = signState(
    { userId, clientId, origin, nonce, expiresAt: Date.now() + STATE_TTL_MS },
    stateKey(app.appSecret)
  )
  const response = NextResponse.redirect(
    authorizeUrl({ appId: app.appId, redirectUri: `${request.nextUrl.origin}${CALLBACK_PATH}`, state })
  )
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    // Lax: o cookie volta no redirecionamento do Instagram (navegação de topo).
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: STATE_TTL_MS / 1000,
  })
  response.headers.set("Cache-Control", "no-store")
  return response
}
