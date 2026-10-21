"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  DELIVERABLE_FILE_MAX,
  DELIVERABLE_TITLE_MAX,
  deliverableExtension,
  isDeliverablePath,
  isDeliverableType,
  normalizeDeliverableUrl,
  type Deliverable,
} from "@/features/deliverables/logic"
import { DELIVERABLES_BUCKET, removeDeliverableFiles } from "@/features/deliverables/storage"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Entregas de uma etapa (links e arquivos que o cliente vê no portal), pela
 * equipe, no painel da tarefa. O arquivo vai do navegador direto ao Storage
 * por uma URL assinada; depois a entrega é salva com o caminho.
 */

const TASK_NOT_FOUND = { ok: false, error: "Essa tarefa não existe mais." } as const
const NOT_FOUND = { ok: false, error: "Essa entrega não existe mais." } as const
const COLUMNS = "id, task_id, kind, title, url, file_path, mime_type, created_at"

function refreshApp() {
  revalidatePath("/", "layout")
}

function cleanTitle(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : ""
  return text && text.length <= DELIVERABLE_TITLE_MAX ? text : null
}

function toDeliverable(row: {
  id: string
  task_id: string
  kind: string
  title: string
  url: string | null
  file_path: string | null
  mime_type: string | null
  created_at: string
}): Deliverable {
  return { ...row, kind: row.kind === "file" ? "file" : "link" }
}

/** A tarefa de projeto de cliente (só nelas o cliente vê entregas) e o cliente dela. */
async function stepClient(supabase: SupabaseServerClient, taskId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tasks")
    .select("project_id, projects(client_id)")
    .eq("id", taskId)
    .maybeSingle()
  return data?.projects?.client_id ?? null
}

export async function loadDeliverables(taskId: string): Promise<ActionResult<Deliverable[]>> {
  await requireUser()
  if (!isUuid(taskId)) return TASK_NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("task_deliverables")
    .select(COLUMNS)
    .eq("task_id", taskId)
    .order("created_at")
  if (error) return dbFailure(error, "Não foi possível carregar as entregas.")
  return { ok: true, data: data.map(toDeliverable) }
}

export async function addDeliverableLink(
  taskId: string,
  input: { title: string; url: string }
): Promise<ActionResult<Deliverable>> {
  const user = await requireUser()
  if (!isUuid(taskId)) return TASK_NOT_FOUND
  const url = normalizeDeliverableUrl(String(input?.url ?? ""))
  if (!url) return { ok: false, error: "Confira o link (ex.: https://figma.com/…)." }
  const title = cleanTitle(input?.title) ?? new URL(url).hostname.replace(/^www\./, "")

  const supabase = await createClient()
  if (!(await stepClient(supabase, taskId))) return { ok: false, error: "A tarefa precisa estar num projeto de cliente." }
  const { data, error } = await supabase
    .from("task_deliverables")
    .insert({ task_id: taskId, kind: "link", title, url, created_by: user.id })
    .select(COLUMNS)
    .single()
  if (error) return dbFailure(error, "Não foi possível salvar o link.")
  refreshApp()
  return { ok: true, data: toDeliverable(data) }
}

/**
 * URL assinada para o navegador enviar o arquivo direto ao Storage, sem passar
 * pelo limite de tamanho das Server Actions, e o caminho que vai na entrega.
 */
export async function createDeliverableUpload(
  taskId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  await requireUser()
  if (!isUuid(taskId)) return TASK_NOT_FOUND
  if (!isDeliverableType(contentType)) return { ok: false, error: "Use uma imagem (PNG, JPG, WebP ou GIF) ou um PDF." }
  if (!Number.isFinite(size) || size <= 0 || size > DELIVERABLE_FILE_MAX) {
    return { ok: false, error: "O arquivo precisa ter até 20 MB." }
  }

  const supabase = await createClient()
  const clientId = await stepClient(supabase, taskId)
  if (!clientId) return { ok: false, error: "A tarefa precisa estar num projeto de cliente." }
  const path = `${clientId}/${taskId}/${crypto.randomUUID()}.${deliverableExtension(contentType)}`
  const { data, error } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar o arquivo." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/** Salva a entrega do arquivo já enviado. Se não der, o arquivo sai do Storage. */
export async function addDeliverableFile(
  taskId: string,
  input: { title: string; path: string; contentType: string; size: number }
): Promise<ActionResult<Deliverable>> {
  const user = await requireUser()
  const path = input?.path
  if (!isUuid(taskId) || !isDeliverablePath(path) || path.split("/")[1] !== taskId) {
    return { ok: false, error: "Arquivo inválido." }
  }
  const supabase = await createClient()
  const title = cleanTitle(input.title)
  const size = Number(input.size)
  if (!title || !isDeliverableType(input.contentType) || !Number.isInteger(size) || size <= 0) {
    await removeDeliverableFiles(supabase, [path])
    return { ok: false, error: "Arquivo inválido." }
  }

  const { data, error } = await supabase
    .from("task_deliverables")
    .insert({
      task_id: taskId,
      kind: "file",
      title,
      file_path: path,
      mime_type: input.contentType,
      size_bytes: size,
      created_by: user.id,
    })
    .select(COLUMNS)
    .single()
  if (error) {
    await removeDeliverableFiles(supabase, [path])
    return dbFailure(error, "Não foi possível salvar o arquivo.")
  }
  refreshApp()
  return { ok: true, data: toDeliverable(data) }
}

export async function renameDeliverable(id: string, title: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const clean = cleanTitle(title)
  if (!clean) return { ok: false, error: "Dê um nome de até 200 caracteres." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("task_deliverables").update({ title: clean }).eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível renomear a entrega.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** Tira a entrega (e o arquivo dela, se houver). */
export async function removeDeliverable(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("task_deliverables").delete().eq("id", id).select("file_path")
  if (error) return dbFailure(error, "Não foi possível tirar a entrega.")
  if (data.length === 0) return NOT_FOUND
  await removeDeliverableFiles(supabase, data.flatMap((row) => (row.file_path ? [row.file_path] : [])))
  refreshApp()
  return { ok: true, data: null }
}
