import type { NextRequest } from "next/server"

import { MESSAGE_AUDIO_BUCKET } from "@/features/voice/logic"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/utils"

/**
 * Áudio de uma mensagem de voz (bucket privado `message-audio`), pelo id da
 * mensagem. A cada pedido o app confere a sessão e redireciona para uma URL
 * assinada que expira em uma hora. Quem vê a mensagem ouve o áudio: a equipe
 * pelo RLS de `messages`, a conta de cliente pela regra do portal (a
 * política de `message_audio` e a do Storage conferem).
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/audios/[id]">) {
  const { id } = await context.params
  if (!isUuid(id)) return new Response("Áudio não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return new Response("Faça login para ouvir este áudio.", { status: 401 })

  const { data: audio } = await supabase.from("message_audio").select("storage_path").eq("message_id", id).maybeSingle()
  if (!audio) return new Response("Áudio não encontrado.", { status: 404 })

  const { data, error } = await supabase.storage.from(MESSAGE_AUDIO_BUCKET).createSignedUrl(audio.storage_path, 3600)
  if (error || !data) return new Response("Áudio não encontrado.", { status: 404 })

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  })
}
