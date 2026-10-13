import "server-only"

import { cache } from "react"

import { requirePortalUser } from "@/features/portal/session"
import type { Database } from "@/lib/supabase/database.types"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ContentStage, MessageKind, Timestamp } from "@/lib/types"

/*
 * Leitura do canal do cliente no portal, só por `portal_channel_messages`:
 * o banco confere o cliente e deixa de fora as mensagens internas e as dos
 * posts que ainda não chegaram a ele.
 */

type ChannelMessageRow = Database["public"]["Functions"]["portal_channel_messages"]["Returns"][number]

/** Mensagens por página do fio da Comunicação (o banco devolve até 200). */
export const PORTAL_THREAD_PAGE = 100

/** O canal do cliente como o portal vê: não lidas, se está arquivado e até onde a conta leu. */
export interface PortalChannelInfo {
  archived: boolean
  unread: number
  last_message_at: Timestamp | null
  last_read_at: Timestamp | null
}

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

export function toChannelMessage(row: ChannelMessageRow): PortalChannelMessage {
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

/** O canal do cliente (null se a conta não vê o cliente ou o canal não existe). */
export const getPortalChannel = cache(async (clientId: string): Promise<PortalChannelInfo | null> => {
  await requirePortalUser()
  const supabase = await createClient()
  return fetchPortalChannel(supabase, clientId)
})

export async function fetchPortalChannel(supabase: SupabaseServerClient, clientId: string): Promise<PortalChannelInfo | null> {
  const { data, error } = await supabase.rpc("portal_channel", { target_client: clientId })
  if (error) throw loadError(error, "a conversa")
  const row = data?.[0]
  if (!row) return null
  return {
    archived: row.archived ?? false,
    unread: row.unread ?? 0,
    last_message_at: row.last_message_at ?? null,
    last_read_at: row.last_read_at ?? null,
  }
}

/**
 * Uma página do fio da Comunicação: as mais recentes (ou as de antes de
 * `olderThan`), da mais antiga para a mais nova, e se há anteriores.
 */
export async function fetchPortalThread(
  supabase: SupabaseServerClient,
  clientId: string,
  olderThan?: Timestamp
): Promise<{ messages: PortalChannelMessage[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc("portal_channel_messages", {
    target_client: clientId,
    max_count: PORTAL_THREAD_PAGE + 1,
    ...(olderThan ? { older_than: olderThan } : {}),
  })
  if (error) throw loadError(error, "as mensagens")
  const rows = data ?? []
  return {
    messages: rows.slice(0, PORTAL_THREAD_PAGE).map(toChannelMessage).reverse(),
    hasMore: rows.length > PORTAL_THREAD_PAGE,
  }
}
