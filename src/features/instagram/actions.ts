"use server"

import { revalidatePath } from "next/cache"

import { getSessionUser } from "@/features/auth/session"
import { getPortalUser } from "@/features/portal/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Desconecta o Instagram do cliente: apaga a conta e o token no banco
 * (`disconnect_instagram_account`, que confere de novo quem chama). Vale para a
 * equipe e para a conta do cliente no portal. O @ do feed fica.
 */
export async function disconnectInstagram(clientId: string): Promise<ActionResult> {
  if (!isUuid(clientId)) return { ok: false, error: "Cliente inválido." }
  const team = await getSessionUser()
  if (!team) {
    const portal = await getPortalUser()
    if (!portal?.clients.some((client) => client.id === clientId)) {
      return { ok: false, error: "Entre na sua conta para desconectar o Instagram." }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("disconnect_instagram_account", { p_client_id: clientId })
  if (error) return dbFailure(error, "Não foi possível desconectar o Instagram.")

  revalidatePath(`/clientes/${clientId}`)
  revalidatePath("/portal/feed")
  return { ok: true, data: null }
}
