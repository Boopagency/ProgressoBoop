import "server-only"

import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Transcrição dos áudios do briefing (issue #108, Parte 3).
 *
 * O fluxo do cliente (PR 2) chama `queueBriefingAudio` logo depois de gravar
 * a linha em `briefing_answer_audios`, com a sessão do cliente. O banco já
 * cria a transcrição "pendente" desse áudio (trigger
 * `queue_briefing_transcription`); a Parte 3 preenche esta função: URL
 * assinada do áudio, fila em `private` por uma função `security definer` e
 * `after()` para processar na hora. Até lá, não faz nada.
 */

export interface QueueBriefingAudioInput {
  /** Id da linha em `briefing_answer_audios`. */
  audioId: string
  /** Caminho do arquivo no bucket `briefing` ("<cliente>/<briefing>/<uuid>"). */
  storagePath: string
}

export async function queueBriefingAudio(supabase: SupabaseServerClient, input: QueueBriefingAudioInput): Promise<void> {
  // Stub da Parte 1: a Parte 3 põe o áudio na fila de transcrição.
  void supabase
  void input
}
