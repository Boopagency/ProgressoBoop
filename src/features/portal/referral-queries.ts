import "server-only"

import { isMissingRelation } from "@/features/client-files/queries"
import { isReferralStatus, type PortalReferral } from "@/features/portal/referral-logic"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/**
 * Indicações do cliente, da mais nova para a mais antiga, só pela função
 * `portal_referrals` com a sessão da pessoa. Cliente de outra conta volta vazio.
 */
export async function getPortalReferrals(clientId: string): Promise<PortalReferral[]> {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_referrals", { target_client: clientId })
  if (error) {
    if (isMissingRelation(error)) return []
    throw loadError(error, "as indicações")
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    contact_name: row.contact_name,
    company: row.company ?? null,
    status: isReferralStatus(row.status) ? row.status : "received",
    created_at: row.created_at,
  }))
}
