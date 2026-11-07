import type { NextRequest } from "next/server"

import { BRIEFING_BUCKET } from "@/features/briefing/storage"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/utils"

/**
 * Áudio de uma resposta do briefing (bucket privado `briefing`), pelo id. A
 * cada pedido o app confere a sessão e redireciona para uma URL assinada de
 * uma hora. Pelo RLS, o cliente ouve só os do briefing dele; a equipe, todos.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/briefing/audios/[id]">) {
  const { id } = await context.params
  if (!isUuid(id)) return new Response("Áudio não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return new Response("Faça login para ouvir este áudio.", { status: 401 })

  const { data: audio } = await supabase.from("briefing_answer_audios").select("storage_path").eq("id", id).maybeSingle()
  if (!audio) return new Response("Áudio não encontrado.", { status: 404 })

  const { data, error } = await supabase.storage.from(BRIEFING_BUCKET).createSignedUrl(audio.storage_path, 3600)
  if (error || !data) return new Response("Áudio não encontrado.", { status: 404 })
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" } })
}
