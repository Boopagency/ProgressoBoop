import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/utils"

/**
 * Imagens dos processos (bucket privado). O documento guarda este endereço
 * estável; a cada pedido o app confere a sessão e redireciona para uma URL
 * assinada que expira em uma hora.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/arquivos/[...path]">) {
  const user = await getSessionUser()
  if (!user) return new Response("Faça login para ver este arquivo.", { status: 401 })

  const { path } = await context.params
  if (path.length !== 2 || !path.every(isUuid)) {
    return new Response("Arquivo não encontrado.", { status: 404 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from("docs").createSignedUrl(path.join("/"), 3600)
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
