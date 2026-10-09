"use server"

import { redirect } from "next/navigation"

import { requireUser } from "@/features/auth/session"
import { consentPath, isAuthorizationId, redirectKind } from "@/features/mcp/oauth"
import { createClient } from "@/lib/supabase/server"

/*
 * Decisão da tela de autorização do Claude. O Supabase Auth guarda o pedido
 * (`authorization_id`) e, depois da decisão, devolve o endereço de volta ao
 * aplicativo (com o código ou com "acesso negado").
 */

/** "Permitir": só a equipe, e só para o Claude. */
export async function approveConnection(formData: FormData): Promise<void> {
  await requireUser()
  const authorizationId = formData.get("authorization_id")
  if (!isAuthorizationId(authorizationId)) redirect("/hoje")

  const supabase = await createClient()
  // Confere de novo no servidor (o formulário pode ter sido montado à mão).
  const { data: details, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (detailsError || !details) redirect(consentPath(authorizationId))
  if (!("authorization_id" in details)) redirect(details.redirect_url)
  if (redirectKind(details.redirect_uri) === "unknown") redirect(consentPath(authorizationId))

  const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (error || !data) {
    console.error(`[oauth] aprovar: ${error?.message ?? "sem resposta"}`)
    redirect(consentPath(authorizationId))
  }
  redirect(data.redirect_url)
}

/**
 * "Cancelar": vale para qualquer conta logada (inclusive a de um cliente, que
 * não pode conectar). Só volta para o aplicativo quando ele é o Claude;
 * senão, a pessoa fica no Boop Admin.
 */
export async function denyConnection(formData: FormData): Promise<void> {
  const authorizationId = formData.get("authorization_id")
  if (!isAuthorizationId(authorizationId)) redirect("/login")

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) redirect("/login")

  const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  const trusted = details !== null && "authorization_id" in details && redirectKind(details.redirect_uri) !== "unknown"

  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (error) console.error(`[oauth] recusar: ${error.message}`)
  redirect(trusted && data ? data.redirect_url : "/login")
}
