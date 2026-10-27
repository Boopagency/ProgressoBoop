import { NextResponse, type NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { instagramApp } from "@/features/instagram/config"
import {
  CALLBACK_PATH,
  cleanCode,
  returnPath,
  sameText,
  STATE_COOKIE,
  stateKey,
  verifyState,
  type ConnectNotice,
} from "@/features/instagram/logic"
import { exchangeCode, exchangeLongToken, fetchProfile } from "@/features/instagram/meta"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/utils"

/**
 * Volta do OAuth do Instagram. Confere o `state` (assinatura, validade, o
 * nonce do cookie deste navegador) e que quem voltou é quem começou e ainda é
 * da equipe ou do cliente. Troca o código pelo token curto e depois pelo
 * longo, lê o perfil, recusa conta pessoal e grava pelo banco
 * (`save_instagram_account`, com a sessão). O token não vai para o navegador
 * nem para log.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const team = await getSessionUser()
  const portal = team ? null : await getPortalUser()

  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url))
    response.cookies.set(STATE_COOKIE, "", { path: "/api/instagram", maxAge: 0 })
    response.headers.set("Cache-Control", "no-store")
    return response
  }
  const fallback = () => finish(team ? "/clientes" : portal ? "/portal/feed" : "/login")

  const app = instagramApp()
  if (!app) return fallback()

  const check = verifyState(params.get("state") ?? "", stateKey(app.appSecret), Date.now())
  if (!check.ok && check.reason !== "expired") return fallback()
  const payload = check.payload
  if (!isUuid(payload.clientId)) return fallback()
  const back = (notice: ConnectNotice) => finish(returnPath(payload.origin, payload.clientId, notice))

  const nonce = request.cookies.get(STATE_COOKIE)?.value ?? ""
  if (!check.ok || !sameText(nonce, payload.nonce)) return back("expirou")

  const userId = team?.id ?? portal?.id
  const allowed = team
    ? payload.origin === "admin"
    : payload.origin === "portal" && Boolean(portal?.clients.some((client) => client.id === payload.clientId))
  if (!userId || userId !== payload.userId || !allowed) return back("sem-acesso")

  if (params.get("error")) return back("cancelado")
  const code = params.get("code")
  if (!code) return back("erro")

  const short = await exchangeCode({
    appId: app.appId,
    appSecret: app.appSecret,
    redirectUri: `${request.nextUrl.origin}${CALLBACK_PATH}`,
    code: cleanCode(code),
  })
  if (!short.ok) {
    console.error(`[instagram] troca do código: ${short.error}`)
    return back("erro")
  }

  const long = await exchangeLongToken({ appSecret: app.appSecret, shortToken: short.value.accessToken })
  if (!long.ok) {
    console.error(`[instagram] token longo: ${long.error}`)
    return back("erro")
  }

  const profile = await fetchProfile(long.value.accessToken)
  if (!profile.ok) {
    console.error(`[instagram] perfil: ${profile.error}`)
    return back("erro")
  }
  if (!profile.value.accountType) return back("pessoal")

  const supabase = await createClient()
  const { error } = await supabase.rpc("save_instagram_account", {
    p_client_id: payload.clientId,
    p_external_user_id: profile.value.userId,
    p_username: profile.value.username,
    p_display_name: profile.value.name ?? "",
    p_profile_picture_url: profile.value.pictureUrl ?? "",
    p_account_type: profile.value.accountType,
    p_permissions: short.value.permissions,
    p_access_token: long.value.accessToken,
    p_expires_in: long.value.expiresIn,
  })
  if (error) {
    console.error(`[instagram] gravar: ${error.code ?? "?"}: ${error.message}`)
    if (error.message === "personal_account") return back("pessoal")
    if (error.code === "42501") return back("sem-acesso")
    return back("erro")
  }

  return back("conectado")
}
