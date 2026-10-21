import "server-only"

import { CLIENT_FILES_BUCKET } from "@/features/client-files/logic"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/** Caminhos dos documentos de um cliente, lidos antes de excluí-lo (as linhas saem em cascata). */
export async function clientFilePaths(supabase: SupabaseServerClient, clientId: string): Promise<string[]> {
  const { data } = await supabase.from("client_files").select("storage_path").eq("client_id", clientId)
  return (data ?? []).map((row) => row.storage_path)
}

/** Apaga arquivos do bucket. Limpeza de cortesia: uma falha aqui não desfaz o que já foi salvo. */
export async function removeClientFileObjects(supabase: SupabaseServerClient, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(CLIENT_FILES_BUCKET).remove([...paths])
  if (error) console.error(`[storage] ${error.message}`)
}
