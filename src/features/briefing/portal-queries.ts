import "server-only"

import type { BriefingStatus, DateKey } from "@/lib/types"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/** O briefing como o cliente vê na tela de boas-vindas: status, prazo e os blocos com o tempo de cada um. */
export interface PortalBriefing {
  id: string
  status: BriefingStatus
  due_on: DateKey
  blocks: { id: string; title: string; description: string | null; estimated_minutes: number | null }[]
}

/** Briefing do cliente (pelo RLS, só o da conta). Sem briefing liberado (ou antes da migration), null. */
export async function getPortalBriefing(clientId: string): Promise<PortalBriefing | null> {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_briefings")
    .select("id, status, due_on, template_id")
    .eq("client_id", clientId)
    .maybeSingle()
  if (error) {
    console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    return null
  }
  if (!data) return null

  const blocks = await supabase
    .from("briefing_blocks")
    .select("id, title, description, estimated_minutes")
    .eq("template_id", data.template_id)
    .eq("active", true)
    .order("position")
  if (blocks.error) throw loadError(blocks.error, "o briefing")
  return { id: data.id, status: data.status, due_on: data.due_on, blocks: blocks.data }
}
