"use client"

import { Loader2, SendHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AUDIO_MAX_MS, formatAudioTime } from "@/features/voice/logic"
import type { RecorderStatus } from "@/features/voice/use-voice-recorder"
import { cn } from "@/lib/utils"

/**
 * No lugar do campo de escrever enquanto grava, como nos aplicativos de
 * conversa: a lixeira (descarta), o ponto vermelho com o tempo e o botão de
 * enviar. Enquanto envia, o tempo vira "Enviando…".
 */
export function RecordingBar({
  status,
  elapsedMs,
  sending,
  onCancel,
  onSend,
}: {
  status: RecorderStatus
  elapsedMs: number
  sending: boolean
  onCancel: () => void
  onSend: () => void
}) {
  const nearLimit = elapsedMs >= AUDIO_MAX_MS - 30000
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Gravando áudio">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCancel}
        disabled={sending}
        aria-label="Descartar áudio"
        className="size-10 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-5" />
      </Button>
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border bg-muted/40 px-4" aria-live="polite">
        {sending ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">Enviando áudio…</span>
          </>
        ) : status === "starting" ? (
          <span className="text-sm text-muted-foreground">Abrindo o microfone…</span>
        ) : (
          <>
            <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60 motion-reduce:animate-none" />
              <span className="relative size-2.5 rounded-full bg-destructive" />
            </span>
            <span className={cn("text-sm font-medium tabular-nums", nearLimit ? "text-destructive" : "text-foreground")}>
              {formatAudioTime(elapsedMs)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {nearLimit ? `Até ${formatAudioTime(AUDIO_MAX_MS)}` : "Gravando…"}
            </span>
          </>
        )}
      </div>
      <Button
        type="button"
        size="icon"
        onClick={onSend}
        disabled={sending || status !== "recording"}
        aria-label="Enviar áudio"
        className="size-10 shrink-0 rounded-full"
      >
        <SendHorizontal className="size-5" />
      </Button>
    </div>
  )
}
