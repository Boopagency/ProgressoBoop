import "server-only"

import { requireUser } from "@/features/auth/session"
import {
  NO_COUNTS,
  THREAD_PAGE,
  type ChannelCounts,
  type ChannelEntry,
  type PendingRequest,
  type ThreadData,
} from "@/features/channels/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { Timestamp } from "@/lib/types"

export const CHANNEL_COLUMNS = "id, kind, client_id, name, archived, created_by, created_at"

/** Mensagem com o cartão do post (capa, título, etapa). */
export const MESSAGE_COLUMNS =
  "id, channel_id, post_id, author_id, kind, body, resolved_at, resolved_by, task_id, created_at, edited_at, post:content_posts(id, client_id, title, stage, format, cover_path, publish_on)"


export async function fetchCounts(supabase: SupabaseServerClient): Promise<Map<string, ChannelCounts>> {
  const { data, error } = await supabase.rpc("channel_counts")
  if (error) throw loadError(error, "as mensagens não lidas")
  return new Map(
    data.map((row) => [row.channel_id, { unread: row.unread, pending: row.pending, last_message_at: row.last_message_at }])
  )
}

/**
 * Uma página do fio: as mensagens mais recentes (ou as de antes de `before`),
 * em ordem, e todos os pedidos pendentes do canal (ou do post).
 */
export async function fetchThread(
  supabase: SupabaseServerClient,
  scope: { channelId: string } | { postId: string },
  before?: Timestamp
): Promise<ThreadData> {
  const page = () => {
    let query = supabase.from("messages").select(MESSAGE_COLUMNS)
    query = "channelId" in scope ? query.eq("channel_id", scope.channelId) : query.eq("post_id", scope.postId)
    if (before) query = query.lt("created_at", before)
    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(THREAD_PAGE + 1)
  }
  const pendingQuery = () => {
    const query = supabase.from("messages").select(MESSAGE_COLUMNS).eq("kind", "change_request").is("resolved_at", null)
    return ("channelId" in scope ? query.eq("channel_id", scope.channelId) : query.eq("post_id", scope.postId))
      .order("created_at")
      .limit(200)
  }
  const [messages, pending] = await Promise.all([page(), before ? null : pendingQuery()])
  if (messages.error) throw loadError(messages.error, "as mensagens")
  if (pending?.error) throw loadError(pending.error, "os pedidos pendentes")
  const rows = messages.data.slice(0, THREAD_PAGE).reverse()
  return { messages: rows, hasMore: messages.data.length > THREAD_PAGE, pending: pending?.data ?? [] }
}

/** Canais que a pessoa enxerga, com participantes e contagens. */
export async function getChannels(): Promise<ChannelEntry[]> {
  await requireUser()
  const supabase = await createClient()
  const [channels, members, counts] = await Promise.all([
    supabase.from("channels").select(CHANNEL_COLUMNS),
    supabase.from("channel_members").select("channel_id, user_id").order("created_at"),
    fetchCounts(supabase),
  ])
  if (channels.error) throw loadError(channels.error, "os canais")
  if (members.error) throw loadError(members.error, "os participantes dos canais")
  const membersOf = new Map<string, string[]>()
  for (const member of members.data) {
    const list = membersOf.get(member.channel_id) ?? []
    list.push(member.user_id)
    membersOf.set(member.channel_id, list)
  }
  return channels.data.map((channel) => ({
    ...channel,
    member_ids: membersOf.get(channel.id) ?? [],
    counts: counts.get(channel.id) ?? NO_COUNTS,
  }))
}

/**
 * Não lidas e pedidos pendentes de todos os canais ativos (barra lateral).
 * É só um contador: se falhar, a área logada abre do mesmo jeito, com zero.
 */
export async function getChannelTotals(): Promise<{ unread: number; pending: number }> {
  await requireUser()
  const supabase = await createClient()
  try {
    const counts = await fetchCounts(supabase)
    let unread = 0
    let pending = 0
    for (const row of counts.values()) {
      unread += row.unread
      pending += row.pending
    }
    return { unread, pending }
  } catch {
    return { unread: 0, pending: 0 }
  }
}

/** Pedidos de ajuste pendentes dos canais ativos, o mais antigo primeiro (tela Hoje). */
export async function getPendingRequests(): Promise<PendingRequest[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("messages")
    .select(`${MESSAGE_COLUMNS}, channel:channels(id, kind, client_id, name, archived)`)
    .eq("kind", "change_request")
    .is("resolved_at", null)
    .order("created_at")
    .limit(100)
  if (error) throw loadError(error, "os pedidos de ajuste")
  return data.filter((row) => !row.channel.archived)
}
