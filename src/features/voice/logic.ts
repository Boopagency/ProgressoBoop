import { isUuid } from "@/lib/utils"

/*
 * Mensagens de voz (`message_audio`, bucket `message-audio`): limites, o tipo
 * de arquivo que cada navegador grava, o tempo "0:12" e o endereço do áudio.
 * Funções puras, usadas na equipe, no portal e na rota do áudio.
 */

export const MESSAGE_AUDIO_BUCKET = "message-audio"

/** Até 5 minutos por áudio (o banco confere o mesmo). */
export const AUDIO_MAX_MS = 5 * 60 * 1000
/** Menos que isso é toque sem querer: não envia. */
export const AUDIO_MIN_MS = 700
/** Até 10 MB (o mesmo limite do bucket; 5 minutos de voz ficam em ~1 MB). */
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024
/** Voz em 32 kbps: boa de ouvir e leve (o plano gratuito tem 1 GB de arquivos). */
export const AUDIO_BITS_PER_SECOND = 32000

/** O áudio de uma mensagem de voz, como as telas recebem. */
export interface MessageAudio {
  duration_ms: number
}

/** Tipos que o bucket aceita. */
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg", "audio/x-m4a"] as const

/**
 * Ordem de preferência para gravar (o primeiro que o navegador suporta): mp4
 * com AAC toca em todo lugar (iPhone, Safari, Chrome); o Chrome antigo e o
 * Firefox só gravam webm/ogg com Opus.
 */
export const RECORDING_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const

/** "audio/webm;codecs=opus" → "audio/webm" (o tipo que vai ao Storage), ou null se não for aceito. */
export function baseAudioType(mime: string): string | null {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? ""
  return (AUDIO_TYPES as readonly string[]).includes(base) ? base : null
}

/** "<quem gravou>/<uuid>" no bucket. */
export function isAudioPath(value: unknown, userId: string): value is string {
  if (typeof value !== "string") return false
  const [folder, file, ...rest] = value.split("/")
  return rest.length === 0 && folder === userId && isUuid(file)
}

export function isAudioDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= AUDIO_MAX_MS
}

/** 65000 → "1:05". */
export function formatAudioTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Endereço estável do áudio de uma mensagem (a rota confere a sessão e redireciona). */
export function audioSrc(messageId: string): string {
  return `/api/audios/${messageId}`
}
