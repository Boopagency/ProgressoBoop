import "server-only"

import { instagramApp, instagramJobsSecret } from "@/features/instagram/config"
import { parseSignedRequest } from "@/features/instagram/logic"
import { createClient } from "@/lib/supabase/server"

export type ForgetResult =
  | { ok: true; removed: number; appSecret: string }
  | { ok: false; status: 400 | 500 | 503; error: string }

/**
 * Avisos da Meta (desautorizar o app, excluir os dados): confere o
 * `signed_request` com a chave secreta do app e apaga as contas da pessoa,
 * com o token, por `instagram_forget_user` (com o segredo dos jobs, porque o
 * aviso vem sem sessão).
 */
export async function forgetFromSignedRequest(request: Request): Promise<ForgetResult> {
  const app = instagramApp()
  const secret = instagramJobsSecret()
  if (!app || !secret) return { ok: false, status: 503, error: "Integração com o Instagram não configurada." }

  const form = await request.formData().catch(() => null)
  const signed = parseSignedRequest(form?.get("signed_request"), app.appSecret)
  if (!signed) return { ok: false, status: 400, error: "signed_request inválido." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("instagram_forget_user", { p_secret: secret, p_user_id: signed.userId })
  if (error) {
    console.error(`[instagram] apagar conta: ${error.message}`)
    return { ok: false, status: 500, error: "Não foi possível apagar agora." }
  }
  return { ok: true, removed: data, appSecret: app.appSecret }
}
