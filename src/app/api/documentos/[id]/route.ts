import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { CLIENT_FILES_BUCKET } from "@/features/client-files/logic"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/utils"

/**
 * Documentos do cliente (bucket privado `client-files`). A cada pedido o app
 * confere a sessão e redireciona para uma URL assinada que expira em uma
 * hora; com `?baixar=1`, o arquivo vem para baixar, com o nome original. A
 * equipe abre qualquer documento; a conta de cliente, só os visíveis do
 * cliente dela (função `portal_client_file` e a política do Storage).
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/documentos/[id]">) {
  const team = await getSessionUser()
  const portal = team ? null : await getPortalUser()
  if (!team && !portal) return new Response("Faça login para ver este arquivo.", { status: 401 })

  const { id } = await context.params
  if (!isUuid(id)) return new Response("Arquivo não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data: file } = team
    ? await supabase.from("client_files").select("storage_path, file_name").eq("id", id).maybeSingle()
    : await supabase.rpc("portal_client_file", { target_file: id }).maybeSingle()
  if (!file) return new Response("Arquivo não encontrado.", { status: 404 })

  const download = request.nextUrl.searchParams.get("baixar") === "1"
  const { data, error } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .createSignedUrl(file.storage_path, 3600, { download: download ? file.file_name : false })
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
