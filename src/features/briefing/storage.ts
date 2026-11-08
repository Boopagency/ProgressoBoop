import "server-only"

import type { SupabaseServerClient } from "@/lib/supabase/server"

/** Bucket privado dos áudios e uploads do briefing ("<cliente>/<briefing>/<arquivo>"). */
export const BRIEFING_BUCKET = "briefing"

/**
 * Arquivos do briefing do cliente (áudios e uploads), lidos antes de excluir o
 * cliente: as linhas saem em cascata e os arquivos, depois. Antes da migration
 * (ou se a leitura falhar), nada.
 */
export async function clientBriefingPaths(supabase: SupabaseServerClient, clientId: string): Promise<string[]> {
  const { data: briefing, error } = await supabase.from("client_briefings").select("id").eq("client_id", clientId).maybeSingle()
  if (error || !briefing) return []
  const [audios, answers] = await Promise.all([
    supabase.from("briefing_answer_audios").select("storage_path").eq("briefing_id", briefing.id),
    supabase.from("briefing_answers").select("files").eq("briefing_id", briefing.id),
  ])
  const paths = (audios.data ?? []).map((row) => row.storage_path)
  for (const row of answers.data ?? []) {
    if (!Array.isArray(row.files)) continue
    for (const file of row.files) {
      if (file && typeof file === "object" && !Array.isArray(file) && typeof file.path === "string") paths.push(file.path)
    }
  }
  return paths
}

export async function removeBriefingObjects(supabase: SupabaseServerClient, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(BRIEFING_BUCKET).remove([...paths])
  if (error) console.error(`[storage] ${error.message}`)
}
