"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import type { ChannelCounts, ThreadData, ThreadMessage } from "@/features/channels/logic"
import { NO_COUNTS } from "@/features/channels/logic"
import { fetchCounts, fetchThread, MESSAGE_COLUMNS } from "@/features/channels/queries"
import {
  parseBody,
  parseChannelName,
  parseMemberIds,
  parseNewMessage,
  type NewMessageInput,
} from "@/features/channels/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { isDateKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions dos canais. A conversa aberta chama loadThread a cada
 * poucos segundos (sem Realtime e sem Supabase no navegador), com a sessão da
 * pessoa e o RLS. Escrever, editar e marcar mensagens não recarrega o app:
 * o fio busca de novo. Criar tarefa e mudar canais recarregam as telas.
 */

const MESSAGE_GONE = { ok: false, error: "Essa mensagem não existe mais." } as const
const CHANNEL_GONE = { ok: false, error: "Esse canal não existe mais (ou você não participa dele)." } as const
const TITLE_MAX = 200

function refreshApp() {
  revalidatePath("/", "layout")
}

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error && error.message ? error.message : fallback }
}

/** Instante ISO como o banco devolve (`2026-10-08T19:28:43.546447+00:00`). */
function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/** Fio do canal: as mais recentes (ou as anteriores a `before`) e os pendentes. */
export async function loadThread(channelId: string, before?: string): Promise<ActionResult<ThreadData>> {
  await requireUser()
  if (!isUuid(channelId)) return CHANNEL_GONE
  if (before !== undefined && !isTimestamp(before)) return { ok: false, error: "Data inválida." }
  try {
    const supabase = await createClient()
    return { ok: true, data: await fetchThread(supabase, { channelId }, before) }
  } catch (error) {
    return failure(error, "Não foi possível carregar as mensagens.")
  }
}

/** Chat do post: as mensagens do canal do cliente que falam do post. */
export async function loadPostThread(
  postId: string,
  before?: string
): Promise<ActionResult<ThreadData & { channelId: string | null }>> {
  await requireUser()
  if (!isUuid(postId)) return { ok: false, error: "Esse post não existe mais." }
  if (before !== undefined && !isTimestamp(before)) return { ok: false, error: "Data inválida." }
  try {
    const supabase = await createClient()
    const { data: post, error } = await supabase.from("content_posts").select("client_id").eq("id", postId).maybeSingle()
    if (error) return dbFailure(error, "Não foi possível carregar a conversa.")
    if (!post) return { ok: false, error: "Esse post não existe mais." }
    const [channel, thread] = await Promise.all([
      supabase.from("channels").select("id").eq("kind", "client").eq("client_id", post.client_id).maybeSingle(),
      fetchThread(supabase, { postId }, before),
    ])
    if (channel.error) return dbFailure(channel.error, "Não foi possível carregar a conversa.")
    // A conversa do post fica no canal em que foi escrita (o cliente atual).
    const channelId = channel.data?.id ?? null
    return { ok: true, data: { ...thread, channelId } }
  } catch (error) {
    return failure(error, "Não foi possível carregar a conversa.")
  }
}

/** Contagens de cada canal (a lista da tela Comunicações pergunta de tempos em tempos). */
export async function loadChannelCounts(): Promise<ActionResult<Record<string, ChannelCounts>>> {
  await requireUser()
  try {
    const supabase = await createClient()
    return { ok: true, data: Object.fromEntries(await fetchCounts(supabase)) }
  } catch (error) {
    return failure(error, "Não foi possível carregar as mensagens não lidas.")
  }
}

/** Não lidas e pendentes de todos os canais (a barra lateral pergunta de tempos em tempos). */
export async function loadChannelTotals(): Promise<ActionResult<{ unread: number; pending: number }>> {
  await requireUser()
  try {
    const supabase = await createClient()
    const counts = await fetchCounts(supabase)
    let unread = 0
    let pending = 0
    for (const row of counts.values()) {
      unread += row.unread
      pending += row.pending
    }
    return { ok: true, data: { unread, pending } }
  } catch (error) {
    return failure(error, "Não foi possível carregar as mensagens não lidas.")
  }
}

export interface ClientChannelSummary {
  channelId: string
  name: string | null
  archived: boolean
  counts: ChannelCounts
  /** As últimas mensagens, em ordem. */
  recent: ThreadMessage[]
  pending: ThreadMessage[]
}

const CLIENT_RECENT = 4

/** Cartão do canal na página do cliente. */
export async function loadClientChannel(clientId: string): Promise<ActionResult<ClientChannelSummary | null>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, error: "Esse cliente não existe mais." }
  try {
    const supabase = await createClient()
    const { data: channel, error } = await supabase
      .from("channels")
      .select("id, name, archived")
      .eq("kind", "client")
      .eq("client_id", clientId)
      .maybeSingle()
    if (error) return dbFailure(error, "Não foi possível carregar o canal.")
    if (!channel) return { ok: true, data: null }
    const [recent, pending, counts] = await Promise.all([
      supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: false })
        .limit(CLIENT_RECENT),
      supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("channel_id", channel.id)
        .eq("kind", "change_request")
        .is("resolved_at", null)
        .order("created_at")
        .limit(50),
      fetchCounts(supabase),
    ])
    if (recent.error) return dbFailure(recent.error, "Não foi possível carregar o canal.")
    if (pending.error) return dbFailure(pending.error, "Não foi possível carregar o canal.")
    return {
      ok: true,
      data: {
        channelId: channel.id,
        name: channel.name,
        archived: channel.archived,
        counts: counts.get(channel.id) ?? NO_COUNTS,
        recent: recent.data.reverse(),
        pending: pending.data,
      },
    }
  } catch (error) {
    return failure(error, "Não foi possível carregar o canal.")
  }
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                           */
/* ------------------------------------------------------------------ */

export async function sendMessage(input: NewMessageInput): Promise<ActionResult<ThreadMessage>> {
  await requireUser()
  const parsed = parseNewMessage(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("messages").insert(parsed.value).select(MESSAGE_COLUMNS).single()
  if (error) {
    if (error.message.includes("arquivado")) return { ok: false, error: "Este canal está arquivado." }
    if (error.code === "23514") return { ok: false, error: "O post precisa ser do cliente deste canal." }
    if (error.code === "23503") return { ok: false, error: "Esse canal (ou o post) não existe mais." }
    if (error.code === "42501") return CHANNEL_GONE
    return dbFailure(error, "Não foi possível enviar.")
  }
  return { ok: true, data }
}

/** Só quem escreveu edita o texto (o banco confere). */
export async function editMessage(id: string, body: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return MESSAGE_GONE
  const parsed = parseBody(body)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase.from("messages").update({ body: parsed.value }).eq("id", id).select("id")
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Só quem escreveu pode editar a mensagem." }
    return dbFailure(error, "Não foi possível salvar.")
  }
  if (data.length === 0) return MESSAGE_GONE
  return { ok: true, data: null }
}

/** Só as próprias (o RLS confere). */
export async function deleteMessage(id: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!isUuid(id)) return MESSAGE_GONE
  const supabase = await createClient()
  const { data, error } = await supabase.from("messages").delete().eq("id", id).eq("author_id", user.id).select("id")
  if (error) return dbFailure(error, "Não foi possível apagar.")
  if (data.length === 0) return { ok: false, error: "Só quem escreveu pode apagar a mensagem." }
  return { ok: true, data: null }
}

/** Marca como pedido de ajuste (ou volta a ser mensagem). Qualquer pessoa da equipe. */
export async function setMessageKind(id: string, kind: "text" | "change_request"): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return MESSAGE_GONE
  if (kind !== "text" && kind !== "change_request") return { ok: false, error: "Tipo inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("messages").update({ kind }).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível mudar a mensagem.")
  if (data.length === 0) return MESSAGE_GONE
  return { ok: true, data: null }
}

/** Resolve (ou reabre) um pedido de ajuste; o banco grava quem e quando. */
export async function setMessageResolved(id: string, resolved: boolean): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return MESSAGE_GONE
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("messages")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("kind", "change_request")
    .select("id")
  if (error) return dbFailure(error, "Não foi possível salvar.")
  if (data.length === 0) return MESSAGE_GONE
  return { ok: true, data: null }
}

export interface MessageTaskInput {
  title: string
  assignee_ids: string[]
  due_date: DateKey | null
}

/**
 * Pedido vira tarefa: com o cliente do canal, o post (e o projeto dele) e a
 * mensagem apontando para a tarefa. Concluir a tarefa resolve o pedido.
 */
export async function createTaskFromMessage(id: string, input: MessageTaskInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(id)) return MESSAGE_GONE
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
  if (!title) return { ok: false, error: "Dê um título à tarefa." }
  if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
  const assignees = Array.isArray(input.assignee_ids) ? [...new Set(input.assignee_ids)] : []
  if (assignees.length === 0 || !assignees.every(isUuid)) return { ok: false, error: "Escolha pelo menos um responsável." }
  if (input.due_date !== null && !isDateKey(input.due_date)) return { ok: false, error: "Prazo inválido." }

  const supabase = await createClient()
  const { data: message, error: readError } = await supabase
    .from("messages")
    .select("id, body, kind, task_id, post_id, channel:channels(kind, client_id), post:content_posts(project_id)")
    .eq("id", id)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível criar a tarefa.")
  if (!message) return MESSAGE_GONE
  if (message.kind === "system") return { ok: false, error: "Esse aviso não vira tarefa." }
  if (message.task_id) return { ok: false, error: "Essa mensagem já virou tarefa." }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: message.body !== title ? message.body : null,
      due_date: input.due_date,
      client_id: message.channel.client_id,
      project_id: message.post?.project_id ?? null,
      content_post_id: message.post_id,
      area: message.channel.kind === "client" ? "clients" : null,
    })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar a tarefa.")
  const assigned = await setAssignees(supabase, task.id, assignees)
  if (!assigned.ok) {
    await supabase.from("tasks").delete().eq("id", task.id)
    return assigned
  }
  // Liga só se ninguém ligou no meio-tempo; senão, a tarefa recém-criada sai.
  const { data: linked, error: linkError } = await supabase
    .from("messages")
    .update({ task_id: task.id })
    .eq("id", id)
    .is("task_id", null)
    .select("id")
  if (linkError || linked.length === 0) {
    await supabase.from("tasks").delete().eq("id", task.id)
    if (linkError) return dbFailure(linkError, "Não foi possível criar a tarefa.")
    return { ok: false, error: "Essa mensagem já virou tarefa." }
  }
  refreshApp()
  return { ok: true, data: { id: task.id } }
}

/** Lido até a mensagem mais nova que a pessoa viu. */
export async function markChannelRead(channelId: string, at: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!isUuid(channelId)) return CHANNEL_GONE
  if (!isTimestamp(at)) return { ok: false, error: "Data inválida." }
  const supabase = await createClient()
  const { error } = await supabase
    .from("channel_reads")
    // O texto vai como veio: o banco guarda microssegundos, e passar por Date
    // cortaria para milissegundos (a última mensagem continuaria "não lida").
    .upsert({ user_id: user.id, channel_id: channelId, last_read_at: at }, { onConflict: "user_id,channel_id" })
  if (error) return dbFailure(error, "Não foi possível marcar como lido.")
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Canais                                                              */
/* ------------------------------------------------------------------ */

function refreshChannels() {
  revalidatePath("/comunicacoes")
}

/**
 * Canal interno. O id é sorteado aqui e o canal entra sem RETURNING: antes do
 * trigger que põe quem criou como participante, ele ainda não é visível.
 */
export async function createChannel(input: { name: string; member_ids: string[] }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const name = parseChannelName(input?.name)
  if (!name.ok) return name
  const members = parseMemberIds(input?.member_ids)
  if (!members.ok) return members
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from("channels").insert({ id, kind: "internal", name: name.value })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um canal com esse nome." }
    return dbFailure(error, "Não foi possível criar o canal.")
  }
  const others = members.value.filter((memberId) => memberId !== user.id)
  if (others.length > 0) {
    const { error: membersError } = await supabase
      .from("channel_members")
      .insert(others.map((memberId) => ({ channel_id: id, user_id: memberId })))
    if (membersError) {
      refreshChannels()
      return dbFailure(membersError, "O canal foi criado, mas não deu para incluir as pessoas. Tente pelo menu do canal.")
    }
  }
  refreshChannels()
  return { ok: true, data: { id } }
}

/** Conversa direta com outra pessoa da equipe (uma por par; o banco acha ou cria). */
export async function openDirectChannel(profileId: string): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  if (!isUuid(profileId)) return { ok: false, error: "Escolha uma pessoa da equipe." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("open_direct_channel", { profile_id: profileId })
  if (error) {
    if (error.code === "22023") return { ok: false, error: "Escolha outra pessoa da equipe." }
    if (error.code === "P0002") return { ok: false, error: "Essa pessoa não está na equipe." }
    return dbFailure(error, "Não foi possível abrir a conversa.")
  }
  refreshChannels()
  return { ok: true, data: { id: data } }
}

/** Renomear (só canal interno) e arquivar ou desarquivar. */
export async function updateChannel(id: string, patch: { name?: string; archived?: boolean }): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return CHANNEL_GONE
  const update: { name?: string; archived?: boolean } = {}
  if (patch?.name !== undefined) {
    const name = parseChannelName(patch.name)
    if (!name.ok) return name
    update.name = name.value
  }
  if (patch?.archived !== undefined) {
    if (typeof patch.archived !== "boolean") return { ok: false, error: "Dados inválidos." }
    update.archived = patch.archived
  }
  const supabase = await createClient()
  let query = supabase.from("channels").update(update).eq("id", id)
  if (update.name !== undefined) query = query.eq("kind", "internal")
  const { data, error } = await query.select("id")
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um canal com esse nome." }
    return dbFailure(error, "Não foi possível salvar o canal.")
  }
  if (data.length === 0) return CHANNEL_GONE
  refreshChannels()
  return { ok: true, data: null }
}

/** Participantes de um canal interno (quem mexe continua participando). */
export async function setChannelMembers(id: string, memberIds: string[]): Promise<ActionResult> {
  const user = await requireUser()
  if (!isUuid(id)) return CHANNEL_GONE
  const parsed = parseMemberIds(memberIds)
  if (!parsed.ok) return parsed
  const wanted = new Set([...parsed.value, user.id])
  const supabase = await createClient()
  const { data: current, error } = await supabase.from("channel_members").select("user_id").eq("channel_id", id)
  if (error) return dbFailure(error, "Não foi possível salvar os participantes.")
  if (!current.some((member) => member.user_id === user.id)) return CHANNEL_GONE
  const have = new Set(current.map((member) => member.user_id))
  const add = [...wanted].filter((memberId) => !have.has(memberId))
  const remove = [...have].filter((memberId) => !wanted.has(memberId))
  if (add.length > 0) {
    const { error: addError } = await supabase.from("channel_members").insert(add.map((memberId) => ({ channel_id: id, user_id: memberId })))
    if (addError) return dbFailure(addError, "Não foi possível incluir as pessoas.")
  }
  if (remove.length > 0) {
    const { error: removeError } = await supabase.from("channel_members").delete().eq("channel_id", id).in("user_id", remove)
    if (removeError) return dbFailure(removeError, "Não foi possível tirar as pessoas.")
  }
  refreshChannels()
  return { ok: true, data: null }
}

export async function leaveChannel(id: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!isUuid(id)) return CHANNEL_GONE
  const supabase = await createClient()
  const { data, error } = await supabase.from("channel_members").delete().eq("channel_id", id).eq("user_id", user.id).select("user_id")
  if (error) return dbFailure(error, "Não foi possível sair do canal.")
  if (data.length === 0) return CHANNEL_GONE
  refreshChannels()
  return { ok: true, data: null }
}

/** Exclui um canal interno com as mensagens (as tarefas criadas a partir dele ficam). */
export async function deleteChannel(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return CHANNEL_GONE
  const supabase = await createClient()
  const { data, error } = await supabase.from("channels").delete().eq("id", id).eq("kind", "internal").select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o canal.")
  if (data.length === 0) return CHANNEL_GONE
  refreshChannels()
  return { ok: true, data: null }
}
