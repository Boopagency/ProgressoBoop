import "server-only"

import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Arquivos do bucket privado `deliverables` (entregas das etapas), sempre com
 * a sessão da pessoa: as políticas do Storage deixam a equipe ver, enviar e
 * apagar. Apagar é limpeza de cortesia: uma falha aqui não desfaz o que já
 * foi salvo no banco.
 */

export const DELIVERABLES_BUCKET = "deliverables"

export async function removeDeliverableFiles(supabase: SupabaseServerClient, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(DELIVERABLES_BUCKET).remove([...paths])
  if (error) console.error(`[storage] ${error.message}`)
}

/** Arquivos das entregas de umas tarefas, para apagar do Storage depois de excluí-las. */
export async function deliverableFilesOf(supabase: SupabaseServerClient, taskIds: readonly string[]): Promise<string[]> {
  if (taskIds.length === 0) return []
  const { data, error } = await supabase
    .from("task_deliverables")
    .select("file_path")
    .in("task_id", [...taskIds])
    .not("file_path", "is", null)
  if (error) {
    console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    return []
  }
  return data.flatMap((row) => (row.file_path ? [row.file_path] : []))
}
