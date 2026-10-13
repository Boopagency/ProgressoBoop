import "server-only"

import { cache } from "react"

import { requirePortalUser } from "@/features/portal/session"
import type { Database } from "@/lib/supabase/database.types"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ContentStage, MessageKind, Timestamp } from "@/lib/types"

/*
 * Leitura do canal do cliente no portal, só por `portal_channel_messages`:
 * o banco confere o cliente e deixa de fora as mensagens internas e as dos
 * posts que ainda não chegaram a ele.
 */

type ChannelMessageRow = Database["public"]["Functions"]["portal_channel_messages"]["Returns"][number]

/** Mensagem do canal do cliente, como ele vê, com o post ou o projeto de que fala. */
export interface PortalChannelMessage {
  id: string
  kind: MessageKind
  body: string
  author_name: string
  from_team: boolean
  mine: boolean
  post: { id: string; title: string; stage: ContentStage } | null
  project: { id: string; name: string } | null
  created_at: Timestamp
}

function toChannelMessage(row: ChannelMessageRow): PortalChannelMessage {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    author_name: row.author_name,
    from_team: row.from_team,
    mine: row.mine,
    post: row.post_id && row.post_title && row.post_stage ? { id: row.post_id, title: row.post_title, stage: row.post_stage } : null,
    project: row.project_id && row.project_name ? { id: row.project_id, name: row.project_name } : null,
    created_at: row.created_at,
  }
}

/** As mensagens mais recentes do canal do cliente, da mais nova para a mais antiga. */
export const getPortalLatestMessages = cache(async (clientId: string, count: number): Promise<PortalChannelMessage[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_channel_messages", { target_client: clientId, max_count: count })
  if (error) throw loadError(error, "as mensagens")
  return (data ?? []).map(toChannelMessage)
})
