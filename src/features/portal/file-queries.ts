import "server-only"

import type { PortalClientFile } from "@/features/client-files/logic"
import { isMissingRelation } from "@/features/client-files/queries"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"

/**
 * Documentos que o cliente vê, do mais novo para o mais antigo, só pela
 * função `portal_client_files` com a sessão da pessoa. Cliente de outra conta
 * volta vazio.
 */
export async function getPortalFiles(clientId: string): Promise<PortalClientFile[]> {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_client_files", { target_client: clientId })
  if (error) {
    if (isMissingRelation(error)) return []
    throw loadError(error, "os documentos")
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
  }))
}
