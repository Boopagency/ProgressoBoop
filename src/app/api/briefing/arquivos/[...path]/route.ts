import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { BRIEFING_BUCKET } from "@/features/briefing/storage"
import { isBriefingPath } from "@/features/briefing/team-logic"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

/**
 * Áudios e arquivos do briefing (bucket privado `briefing`), pelo caminho
 * "<cliente>/<briefing>/<arquivo>". A cada pedido o app confere a sessão e
 * redireciona para uma URL assinada que expira em uma hora; nunca há URL
 * pública. Quem lê decide a política do Storage: a equipe lê tudo, a conta
 * de cliente só a pasta do briefing dela. `?baixar=<nome>` baixa com o nome.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/briefing/arquivos/[...path]">) {
  const user = (await getSessionUser()) ?? (await getPortalUser())
  if (!user) return new Response("Faça login para ver este arquivo.", { status: 401 })

  const { path } = await context.params
  const objectPath = path.join("/")
  if (!isBriefingPath(objectPath)) return new Response("Arquivo não encontrado.", { status: 404 })

  const download = request.nextUrl.searchParams.get("baixar")?.slice(0, 200) || false
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BRIEFING_BUCKET).createSignedUrl(objectPath, 3600, { download })
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
