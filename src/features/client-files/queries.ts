import "server-only"

import { requireUser } from "@/features/auth/session"
import type { ClientFile } from "@/features/client-files/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/** Tabela ou função que o banco ainda não tem (a migration não foi aplicada). */
export function isMissingRelation(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883"
}

export const CLIENT_FILE_COLUMNS =
  "id, client_id, name, category, description, file_name, mime_type, size_bytes, client_visible, created_at"

/** Documentos do cliente, do mais novo para o mais antigo (visão da equipe). */
export async function getClientFiles(clientId: string): Promise<ClientFile[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("client_files")
    .select(CLIENT_FILE_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
  if (error) {
    // Antes da migration client_files (prévia, ou logo depois do merge), a
    // página do cliente abre sem os documentos em vez de cair no erro.
    if (isMissingRelation(error)) return []
    throw loadError(error, "os documentos do cliente")
  }
  return data
}
