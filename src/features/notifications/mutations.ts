import "server-only"

import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/**
 * Marca como lido um aviso da pessoa (ou todos, com `id` null). A hora da
 * leitura é a do banco (trigger set_notification_fields). Usada pelo sino e
 * pelo conector do Claude.
 */
export async function markRead(supabase: SupabaseServerClient, userId: string, id: string | null): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Essa notificação não existe mais." }
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null)
  if (id !== null) query = query.eq("id", id)
  const { error } = await query
  if (error) return dbFailure(error, id ? "Não foi possível marcar como lida." : "Não foi possível marcar as notificações como lidas.")
  return { ok: true, data: null }
}
