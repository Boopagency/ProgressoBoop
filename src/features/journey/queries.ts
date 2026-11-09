import "server-only"

import { requireUser } from "@/features/auth/session"
import { isMissingRelation } from "@/features/client-files/queries"
import { parseJourneyRows, type JourneyRecord } from "@/features/journey/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/*
 * Leitura da jornada pela equipe: uma chamada só (`team_journeys`), que traz
 * as jornadas, as marcações e os dados do sistema já agregados no banco.
 */

/** `available: false` antes da migration (a tela e a barra não aparecem). */
export type JourneysState = { available: false } | { available: true; journeys: JourneyRecord[] }

/** Todas as jornadas, ou as de um cliente. */
export async function getJourneys(clientId?: string): Promise<JourneysState> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("team_journeys", clientId ? { p_client: clientId } : {})
  if (error) {
    if (isMissingRelation(error)) return { available: false }
    throw loadError(error, "a jornada dos clientes")
  }
  return { available: true, journeys: parseJourneyRows(data) }
}
