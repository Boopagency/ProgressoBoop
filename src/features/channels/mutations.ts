import "server-only"

import type { ThreadMessage } from "@/features/channels/logic"
import { MESSAGE_COLUMNS } from "@/features/channels/queries"
import { parseBody, parseNewMessage } from "@/features/channels/validation"
import { setAssignees } from "@/features/tasks/assignees"
import { isDateKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações das mensagens dos canais, usadas pelas Server Actions e pelo
 * conector do Claude (mesma validação, mesmo RLS). O banco confere autoria,
 * canal arquivado, mensagem interna e grava quem resolveu cada pedido.
 */

export const MESSAGE_GONE = { ok: false, error: "Essa mensagem não existe mais." } as const
const CHANNEL_GONE = { ok: false, error: "Esse canal não existe mais (ou você não participa dele)." } as const
const TITLE_MAX = 200

export async function insertMessage(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<ThreadMessage>> {
  const parsed = parseNewMessage(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("messages").insert(parsed.value).select(MESSAGE_COLUMNS).single()
  if (error) {
    if (error.message.includes("arquivado")) return { ok: false, error: "Este canal está arquivado." }
    if (error.message.includes("interna")) return { ok: false, error: "Mensagem interna só no canal do cliente." }
    if (error.code === "23514") return { ok: false, error: "O post ou o projeto precisa ser do cliente deste canal." }
    if (error.code === "23503") return { ok: false, error: "Esse canal (ou o post, ou o projeto) não existe mais." }
    if (error.code === "42501") return CHANNEL_GONE
    return dbFailure(error, "Não foi possível enviar.")
  }
  return { ok: true, data }
}

/** Só quem escreveu edita o texto (o banco confere). */
export async function writeMessageBody(supabase: SupabaseServerClient, id: string, body: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return MESSAGE_GONE
  const parsed = parseBody(body)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase.from("messages").update({ body: parsed.value }).eq("id", id).select("id")
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Só quem escreveu pode editar a mensagem." }
    return dbFailure(error, "Não foi possível salvar.")
  }
  if (data.length === 0) return MESSAGE_GONE
  return { ok: true, data: null }
}

/** Só as próprias (o RLS confere). */
export async function removeMessage(supabase: SupabaseServerClient, userId: string, id: string): Promise<ActionResult> {
  if (!isUuid(id)) return MESSAGE_GONE
  const { data, error } = await supabase.from("messages").delete().eq("id", id).eq("author_id", userId).select("id")
  if (error) return dbFailure(error, "Não foi possível apagar.")
  if (data.length === 0) return { ok: false, error: "Só quem escreveu pode apagar a mensagem." }
  return { ok: true, data: null }
}

/** Resolve (ou reabre) um pedido de ajuste; o banco grava quem e quando. */
export async function writeMessageResolved(supabase: SupabaseServerClient, id: string, resolved: unknown): Promise<ActionResult> {
  if (!isUuid(id) || typeof resolved !== "boolean") return MESSAGE_GONE
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
 * Pedido vira tarefa: com o cliente do canal, o post, o projeto (o da
 * mensagem ou o do post) e a mensagem apontando para a tarefa. Concluir a
 * tarefa resolve o pedido.
 */
export async function messageTask(
  supabase: SupabaseServerClient,
  id: string,
  input: MessageTaskInput
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(id)) return MESSAGE_GONE
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
  if (!title) return { ok: false, error: "Dê um título à tarefa." }
  if (title.length > TITLE_MAX) return { ok: false, error: "Título muito longo." }
  const assignees = Array.isArray(input.assignee_ids) ? [...new Set(input.assignee_ids)] : []
  if (assignees.length === 0 || !assignees.every(isUuid)) return { ok: false, error: "Escolha pelo menos um responsável." }
  if (input.due_date !== null && !isDateKey(input.due_date)) return { ok: false, error: "Prazo inválido." }

  const { data: message, error: readError } = await supabase
    .from("messages")
    .select("id, body, kind, task_id, post_id, project_id, channel:channels(kind, client_id), post:content_posts(project_id)")
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
      project_id: message.project_id ?? message.post?.project_id ?? null,
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
  return { ok: true, data: { id: task.id } }
}
