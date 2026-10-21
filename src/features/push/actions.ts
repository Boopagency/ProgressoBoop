"use server"

import { requireAccount } from "@/features/account/session"
import { ENDPOINT_MAX, parseSubscription } from "@/features/push/logic"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/*
 * Notificações no celular (equipe e portal): cada pessoa ativa, renova e tira
 * a inscrição do próprio aparelho. Nenhuma tela lista os aparelhos, então não
 * há o que revalidar.
 */

/** Ativa (ou renova) as notificações deste aparelho para quem está logado. */
export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  await requireAccount()
  const subscription = parseSubscription(input)
  if (!subscription) return { ok: false, error: "Este aparelho não entregou uma inscrição válida." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_device: subscription.device ?? undefined,
  })
  if (error) return dbFailure(error, "Não foi possível ativar as notificações.")
  return { ok: true, data: null }
}

/** Tira as notificações deste aparelho (desativar ou sair da conta). */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const account = await requireAccount()
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > ENDPOINT_MAX) {
    return { ok: false, error: "Aparelho inválido." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", account.id)
  if (error) return dbFailure(error, "Não foi possível desativar as notificações.")
  return { ok: true, data: null }
}
