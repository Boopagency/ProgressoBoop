import "server-only"

import type { MessageAudio } from "@/features/voice/logic"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/**
 * Junta às mensagens o áudio das que são de voz (pelo RLS de
 * `message_audio`: quem vê a mensagem vê o áudio). É um extra: se falhar
 * (ou antes da migration entrar no banco), as mensagens seguem com o texto
 * "Mensagem de voz".
 */
export async function withAudio<T extends { id: string }>(
  supabase: SupabaseServerClient,
  messages: T[]
): Promise<(T & { audio: MessageAudio | null })[]> {
  const ids = [...new Set(messages.map((message) => message.id))]
  const found = new Map<string, MessageAudio>()
  if (ids.length > 0) {
    const { data, error } = await supabase.from("message_audio").select("message_id, duration_ms").in("message_id", ids)
    if (error) console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
    for (const row of data ?? []) found.set(row.message_id, { duration_ms: row.duration_ms })
  }
  return messages.map((message) => ({ ...message, audio: found.get(message.id) ?? null }))
}
