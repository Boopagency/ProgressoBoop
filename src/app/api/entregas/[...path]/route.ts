import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { isDeliverablePath } from "@/features/deliverables/logic"
import { DELIVERABLES_BUCKET } from "@/features/deliverables/storage"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

/**
 * Arquivos das entregas das etapas (imagens e PDFs; bucket privado). O banco
 * guarda o caminho `<cliente>/<tarefa>/<arquivo>`; a cada pedido o app confere
 * a sessão e redireciona para uma URL assinada que expira em uma hora. Conta
 * de cliente (portal) também passa: a política do Storage só deixa ela ler os
 * arquivos das etapas que vê.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/entregas/[...path]">) {
  const user = (await getSessionUser()) ?? (await getPortalUser())
  if (!user) return new Response("Faça login para ver este arquivo.", { status: 401 })

  const { path } = await context.params
  const objectPath = path.join("/")
  if (!isDeliverablePath(objectPath)) return new Response("Arquivo não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrl(objectPath, 3600)
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
