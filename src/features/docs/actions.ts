"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { blocksToText } from "@/features/docs/logic"
import {
  insertDoc,
  NOT_FOUND,
  patchDoc,
  writeDocContent,
  writeDocReviewed,
  type NewDocInput,
  type SaveContentResult,
} from "@/features/docs/mutations"
import { TEXT_MAX, TITLE_MAX, type DocPatch } from "@/features/docs/validation"
import { isDateKey, todayKey } from "@/lib/dates"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions dos processos. O banco cuida do resto: autoria, data de
 * atualização e versões anteriores (trigger set_doc_fields) e RLS.
 */

const VERSION_NOT_FOUND = { ok: false, error: "Versão não encontrada." } as const
const DOCS_BUCKET = "docs"
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const IMAGE_MAX = 5 * 1024 * 1024
const TASKS_MAX = 50

function refreshApp() {
  revalidatePath("/", "layout")
}

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) refreshApp()
  return result
}

export async function createDoc(input: NewDocInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  return refreshed(await insertDoc(await createClient(), user.id, input))
}

export async function updateDoc(id: string, patch: DocPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchDoc(await createClient(), id, patch))
}

export async function saveDocContent(
  id: string,
  content: unknown,
  baseStamp: string,
  force = false
): Promise<SaveContentResult> {
  await requireUser()
  return writeDocContent(await createClient(), id, content, baseStamp, force)
}

/** Conteúdo atual (para recarregar o editor depois de um conflito). */
export async function getDocContent(
  id: string
): Promise<ActionResult<{ content: unknown[]; stamp: string }>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("docs")
    .select("content, content_updated_at")
    .eq("id", id)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível carregar o documento.")
  if (!data) return NOT_FOUND
  return {
    ok: true,
    data: {
      content: Array.isArray(data.content) ? data.content : [],
      stamp: data.content_updated_at,
    },
  }
}

/** Revisado hoje: a próxima revisão conta a partir de agora. */
export async function markDocReviewed(id: string): Promise<ActionResult> {
  await requireUser()
  return refreshed(await writeDocReviewed(await createClient(), id))
}

export async function duplicateDoc(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data: doc, error } = await supabase
    .from("docs")
    .select("title, kind, area, client_id, summary, content, content_text, review_every_months")
    .eq("id", id)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível duplicar.")
  if (!doc) return NOT_FOUND

  const title = `${doc.title} (cópia)`.slice(0, TITLE_MAX)
  const { data, error: insertError } = await supabase
    .from("docs")
    .insert({ ...doc, title, owner_id: user.id, status: "draft", reviewed_on: todayKey() })
    .select("id")
    .single()
  if (insertError) return dbFailure(insertError, "Não foi possível duplicar.")

  refreshApp()
  return { ok: true, data: { id: data.id } }
}

/** Exclui o documento, as versões (cascade) e as imagens dele. */
export async function deleteDoc(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase.from("docs").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir.")
  if (data.length === 0) return NOT_FOUND

  // Imagens: limpeza de cortesia (uma falha aqui não desfaz a exclusão).
  const { data: files } = await supabase.storage.from(DOCS_BUCKET).list(id, { limit: 1000 })
  if (files && files.length > 0) {
    await supabase.storage.from(DOCS_BUCKET).remove(files.map((file) => `${id}/${file.name}`))
  }

  refreshApp()
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* Versões                                                             */
/* ------------------------------------------------------------------ */

export async function getVersionContent(
  versionId: string
): Promise<ActionResult<{ title: string; content: unknown[] }>> {
  await requireUser()
  if (!isUuid(versionId)) return VERSION_NOT_FOUND

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("doc_versions")
    .select("title, content")
    .eq("id", versionId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir a versão.")
  if (!data) return VERSION_NOT_FOUND
  return {
    ok: true,
    data: { title: data.title, content: Array.isArray(data.content) ? data.content : [] },
  }
}

/**
 * Volta o documento para uma versão. O texto atual vai sempre para o
 * histórico (função restore_doc_version), então dá para desfazer.
 */
export async function restoreDocVersion(
  versionId: string
): Promise<ActionResult<{ content: unknown[]; stamp: string }>> {
  await requireUser()
  if (!isUuid(versionId)) return VERSION_NOT_FOUND

  const supabase = await createClient()
  const { data: version, error } = await supabase
    .from("doc_versions")
    .select("content")
    .eq("id", versionId)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível restaurar.")
  if (!version) return VERSION_NOT_FOUND

  const { data: stamp, error: restoreError } = await supabase.rpc("restore_doc_version", {
    version_id: versionId,
    version_text: blocksToText(version.content).slice(0, TEXT_MAX),
  })
  if (restoreError) return dbFailure(restoreError, "Não foi possível restaurar.")
  if (!stamp) return NOT_FOUND

  refreshApp()
  return {
    ok: true,
    data: { content: Array.isArray(version.content) ? version.content : [], stamp },
  }
}

/* ------------------------------------------------------------------ */
/* Checklist → tarefas                                                 */
/* ------------------------------------------------------------------ */

export interface TasksFromDocInput {
  items: string[]
  assignee_ids: string[]
  due_date: DateKey | null
  client_id: string | null
}

export async function createTasksFromDoc(
  docId: string,
  input: TasksFromDocInput
): Promise<ActionResult<{ count: number }>> {
  await requireUser()
  if (!isUuid(docId)) return NOT_FOUND
  const items = Array.isArray(input?.items)
    ? input.items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    : []
  if (items.length === 0) return { ok: false, error: "Escolha pelo menos um item." }
  if (items.length > TASKS_MAX) return { ok: false, error: `No máximo ${TASKS_MAX} itens de uma vez.` }
  const assignees = Array.isArray(input.assignee_ids) ? [...new Set(input.assignee_ids)] : []
  if (assignees.length === 0 || !assignees.every(isUuid)) {
    return { ok: false, error: "Escolha pelo menos um responsável." }
  }
  if (input.due_date !== null && !isDateKey(input.due_date)) return { ok: false, error: "Prazo inválido." }
  if (input.client_id !== null && !isUuid(input.client_id)) return { ok: false, error: "Cliente inválido." }

  const supabase = await createClient()
  const { data: doc, error: docError } = await supabase
    .from("docs")
    .select("title, area")
    .eq("id", docId)
    .maybeSingle()
  if (docError) return dbFailure(docError, "Não foi possível criar as tarefas.")
  if (!doc) return NOT_FOUND

  const { data: tasks, error } = await supabase
    .from("tasks")
    .insert(
      items.map((item) => ({
        title: item.length > TITLE_MAX ? `${item.slice(0, TITLE_MAX - 1).trimEnd()}…` : item,
        description: item.length > TITLE_MAX ? item : null,
        due_date: input.due_date,
        client_id: input.client_id,
        area: doc.area,
        doc_id: docId,
      }))
    )
    .select("id")
  if (error) return dbFailure(error, "Não foi possível criar as tarefas.")

  const { error: assignError } = await supabase
    .from("task_assignees")
    .insert(tasks.flatMap((task) => assignees.map((profileId) => ({ task_id: task.id, profile_id: profileId }))))
  if (assignError) {
    // Tarefas sem responsável sumiriam das listas "Minhas": desfaz.
    await supabase.from("tasks").delete().in("id", tasks.map((task) => task.id))
    return dbFailure(assignError, "Não foi possível criar as tarefas.")
  }

  refreshApp()
  return { ok: true, data: { count: tasks.length } }
}

/* ------------------------------------------------------------------ */
/* Imagens                                                             */
/* ------------------------------------------------------------------ */

/**
 * URL assinada para o navegador enviar uma imagem direto ao Storage (sem
 * passar pelo limite de tamanho das Server Actions) e o endereço estável
 * que vai no documento (/api/arquivos/…), que só abre para a equipe.
 */
export async function createDocImageUpload(
  docId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; url: string }>> {
  await requireUser()
  if (!isUuid(docId)) return NOT_FOUND
  if (!IMAGE_TYPES.includes(contentType)) {
    return { ok: false, error: "Use uma imagem PNG, JPG, WebP ou GIF." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > IMAGE_MAX) {
    return { ok: false, error: "A imagem precisa ter até 5 MB." }
  }

  const path = `${docId}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar a imagem." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, url: `/api/arquivos/${path}` } }
}
