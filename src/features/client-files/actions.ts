"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import {
  CLIENT_FILE_MAX,
  CLIENT_FILES_BUCKET,
  CLIENT_FILE_TYPES_HINT,
  isClientFilePath,
  isClientFileType,
  type ClientFile,
} from "@/features/client-files/logic"
import { CLIENT_FILE_COLUMNS } from "@/features/client-files/queries"
import { removeClientFileObjects } from "@/features/client-files/storage"
import { parseClientFileFields, parseClientFilePatch } from "@/features/client-files/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions dos documentos do cliente. O arquivo vai do navegador direto
 * ao Storage (bucket `client-files`) por uma URL assinada; depois a linha é
 * salva com o tamanho e o tipo que o Storage registrou. Excluir apaga a linha
 * e o arquivo.
 */

const CLIENT_NOT_FOUND = { ok: false, error: "Esse cliente não existe mais." } as const
const NOT_FOUND = { ok: false, error: "Esse documento não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

/** URL assinada para o navegador enviar o arquivo e o caminho `<client_id>/<uuid>` que vai no banco. */
export async function createClientFileUpload(
  clientId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (typeof contentType !== "string" || !isClientFileType(contentType)) {
    return { ok: false, error: `Esse tipo de arquivo não é aceito. Use ${CLIENT_FILE_TYPES_HINT}.` }
  }
  if (!Number.isFinite(size) || size <= 0 || size > CLIENT_FILE_MAX) {
    return { ok: false, error: "O arquivo precisa ter até 25 MB." }
  }

  const path = `${clientId}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(CLIENT_FILES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar o arquivo." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/** Salva o documento do arquivo que acabou de ser enviado (`path`). */
export async function saveClientFile(
  clientId: string,
  upload: { path: string; fileName: string },
  fields: unknown
): Promise<ActionResult<ClientFile>> {
  const user = await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (!isClientFilePath(upload?.path, clientId)) return { ok: false, error: "Arquivo inválido." }
  const fileName = typeof upload.fileName === "string" ? upload.fileName.trim().slice(0, 255) : ""
  if (!fileName) return { ok: false, error: "Arquivo inválido." }
  const parsed = parseClientFileFields(fields)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  // Tamanho e tipo valem como o Storage registrou, não como o navegador disse.
  const { data: info, error: infoError } = await supabase.storage.from(CLIENT_FILES_BUCKET).info(upload.path)
  if (infoError || !info) {
    console.error(`[storage] ${infoError?.message ?? "sem dados"}`)
    return { ok: false, error: "O arquivo não chegou. Envie de novo." }
  }
  const mimeType = info.contentType ?? ""
  const size = info.size ?? 0

  const { data, error } = await supabase
    .from("client_files")
    .insert({
      client_id: clientId,
      storage_path: upload.path,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: size,
      created_by: user.id,
      ...parsed.value,
    })
    .select(CLIENT_FILE_COLUMNS)
    .single()
  if (error) {
    await removeClientFileObjects(supabase, [upload.path])
    if (error.code === "23503") return CLIENT_NOT_FOUND
    return dbFailure(error, "Não foi possível salvar o documento.")
  }
  refreshApp()
  return { ok: true, data }
}

/** Nome, tipo, descrição ou se o cliente vê. */
export async function updateClientFile(id: string, patch: unknown): Promise<ActionResult<ClientFile>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseClientFilePatch(patch)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_files")
    .update(parsed.value)
    .eq("id", id)
    .select(CLIENT_FILE_COLUMNS)
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível salvar o documento.")
  if (!data) return NOT_FOUND
  refreshApp()
  return { ok: true, data }
}

export async function deleteClientFile(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("client_files").delete().eq("id", id).select("storage_path")
  if (error) return dbFailure(error, "Não foi possível excluir o documento.")
  if (data.length === 0) return NOT_FOUND
  await removeClientFileObjects(supabase, data.map((row) => row.storage_path))
  refreshApp()
  return { ok: true, data: null }
}

/** Apaga um arquivo enviado que não chegou a ser salvo (o diálogo foi fechado). O que já está salvo fica. */
export async function discardClientFileUpload(clientId: string, path: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId) || !isClientFilePath(path, clientId)) return { ok: false, error: "Arquivo inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("client_files").select("id").eq("storage_path", path).limit(1)
  if (error) return dbFailure(error, "Não foi possível descartar o arquivo.")
  if (data.length === 0) await removeClientFileObjects(supabase, [path])
  return { ok: true, data: null }
}
