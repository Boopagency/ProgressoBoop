import "server-only"

import { isMissingRelation } from "@/features/client-files/queries"
import { EMPTY_PORTAL_FINANCE, parsePortalFinance, type PortalFinanceData } from "@/features/portal/finance-logic"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/**
 * Receitas do cliente no portal, só pela função `portal_finance` com a sessão
 * da pessoa (só os campos liberados). Cliente de outra conta volta vazio.
 */
export async function getPortalFinance(clientId: string): Promise<PortalFinanceData> {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_finance", { target_client: clientId })
  if (error) {
    // Antes da migration do financeiro no portal, a aba fica vazia.
    if (isMissingRelation(error)) return EMPTY_PORTAL_FINANCE
    throw loadError(error, "o financeiro")
  }
  return parsePortalFinance(clientId, data)
}
