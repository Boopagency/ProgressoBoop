import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { isContentImagePath } from "@/features/content/logic"
import { CONTENT_BUCKET } from "@/features/content/storage"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagens da Central de Conteúdo (capas, slides e a foto do perfil do
 * cliente; bucket privado). O banco guarda o caminho `<cliente>/<arquivo>`;
 * a cada pedido o app confere a sessão e redireciona para uma URL assinada
 * que expira em uma hora. Nunca há URL pública.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/conteudo/[...path]">) {
  const user = await getSessionUser()
  if (!user) return new Response("Faça login para ver este arquivo.", { status: 401 })

  const { path } = await context.params
  const objectPath = path.join("/")
  if (!isContentImagePath(objectPath)) return new Response("Arquivo não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrl(objectPath, 3600)
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
