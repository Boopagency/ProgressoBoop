"use client"

import { Loader2, Mic, Plus, RotateCcw, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { BRIEFING_AUDIO_MAX_MS, briefingAudioSrc, type BriefingAudio } from "@/features/briefing/flow-logic"
import { AudioPlayer } from "@/features/voice/audio-player"
import { AUDIO_MIN_MS, formatAudioTime } from "@/features/voice/logic"
import type { Recording } from "@/features/voice/upload"
import { useCanRecordAudio, useVoiceRecorder } from "@/features/voice/use-voice-recorder"
import { cn } from "@/lib/utils"

const BARS = 32

/** Onda sonora enquanto grava: barras que sobem com o volume do microfone. */
function VoiceWave({ readLevel }: { readLevel: () => number }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const levels = useRef<number[]>(Array.from({ length: BARS }, () => 0))

  useEffect(() => {
    let frame = 0
    let last = 0
    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick)
      if (time - last < 60) return
      last = time
      levels.current = [...levels.current.slice(1), readLevel()]
      levels.current.forEach((level, index) => {
        const bar = bars.current[index]
        if (bar) bar.style.transform = `scaleY(${Math.max(0.08, level)})`
      })
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [readLevel])

  return (
    <div className="flex h-12 w-full max-w-72 items-center justify-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: BARS }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            bars.current[index] = element
          }}
          className="h-full w-1 origin-center scale-y-[0.08] rounded-full bg-glow transition-transform duration-75 motion-reduce:transition-none"
        />
      ))}
    </div>
  )
}

/**
 * A resposta por áudio: o botão grande de gravar (tocar para começar e para
 * parar), a onda enquanto grava e o tempo até 3 minutos. Depois de gravar,
 * ouve, regrava ou complementa com outro áudio. Sem transcrição na tela.
 */
export function VoiceAnswer({
  audios,
  onRecorded,
  onDelete,
  disabled = false,
  compact = false,
}: {
  audios: BriefingAudio[]
  /** Envia e guarda a gravação; true quando deu certo. */
  onRecorded: (recording: Recording) => Promise<boolean>
  onDelete: (audio: BriefingAudio) => Promise<boolean>
  disabled?: boolean
  /** Versão menor, para o complemento de uma pergunta (ex.: "o que te atraiu"). */
  compact?: boolean
}) {
  const canRecord = useCanRecordAudio()
  const [saving, setSaving] = useState(false)
  const recorder = useVoiceRecorder({ maxMs: BRIEFING_AUDIO_MAX_MS, analyse: true, onLimit: () => void stop(true) })
  const recording = recorder.status !== "idle"
  const nearLimit = recorder.elapsedMs >= BRIEFING_AUDIO_MAX_MS - 20000

  async function stop(fromLimit = false) {
    const result = await recorder.finish()
    if (!result) return
    if (fromLimit) toast.message("Chegou a 3 minutos. Se quiser falar mais, grave outro áudio para complementar.")
    if (result.durationMs < AUDIO_MIN_MS) {
      toast.message("Ficou curtinho demais. Toque e fale um pouco mais.")
      return
    }
    setSaving(true)
    await onRecorded(result)
    setSaving(false)
  }

  async function rerecord(audio: BriefingAudio) {
    setSaving(true)
    const removed = await onDelete(audio)
    setSaving(false)
    if (removed) await recorder.start()
  }

  function toggle() {
    if (saving || disabled) return
    if (recorder.status === "recording") void stop()
    else if (recorder.status === "idle") void recorder.start()
  }

  const showBigButton = audios.length === 0 || recording || saving

  return (
    <div className={cn("flex flex-col items-center gap-4", compact && "items-start gap-3")}>
      {audios.length > 0 ? (
        <ul className="w-full space-y-2" aria-label="Seus áudios">
          {audios.map((audio, index) => (
            <li key={audio.id} className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2">
              <span className="eyebrow w-14 shrink-0 text-muted-foreground">{index === 0 ? "Áudio" : `+ ${index}`}</span>
              <div className="min-w-0 flex-1">
                <AudioPlayer messageId={audio.id} durationMs={audio.duration_ms} src={briefingAudioSrc(audio.id)} />
              </div>
              {index === audios.length - 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={recording || saving || disabled || !canRecord}
                  onClick={() => void rerecord(audio)}
                >
                  <RotateCcw className="size-3.5" />
                  Regravar
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Apagar este áudio"
                disabled={recording || saving || disabled}
                onClick={async () => {
                  setSaving(true)
                  await onDelete(audio)
                  setSaving(false)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {!canRecord ? (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Este navegador não grava áudio. Pode escrever aqui embaixo, sem problema.
        </p>
      ) : showBigButton ? (
        <div className={cn("flex flex-col items-center gap-3", compact && "flex-row gap-4")}>
          <button
            type="button"
            onClick={toggle}
            disabled={saving || disabled || recorder.status === "starting"}
            aria-pressed={recording}
            aria-label={recording ? "Parar a gravação" : "Gravar resposta"}
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-full outline-none transition-[transform,background-color,box-shadow] [-webkit-tap-highlight-color:transparent] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 disabled:opacity-70",
              compact ? "size-14" : "size-24",
              recording ? "bg-destructive text-white" : "bg-primary text-primary-foreground shadow-glow"
            )}
          >
            {recording ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30 motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            {saving || recorder.status === "starting" ? (
              <Loader2 className={cn("animate-spin", compact ? "size-5" : "size-8")} aria-hidden="true" />
            ) : recording ? (
              <Square className={cn("relative fill-current", compact ? "size-5" : "size-7")} aria-hidden="true" />
            ) : (
              <Mic className={compact ? "size-6" : "size-9"} aria-hidden="true" />
            )}
          </button>
          <div className={cn("flex flex-col items-center gap-1", compact && "items-start")} aria-live="polite">
            {recording ? (
              <>
                {compact ? null : <VoiceWave readLevel={recorder.readLevel} />}
                <span className={cn("text-sm font-medium tabular-nums", nearLimit ? "text-destructive" : "text-foreground")}>
                  {formatAudioTime(recorder.elapsedMs)} <span className="text-muted-foreground">/ {formatAudioTime(BRIEFING_AUDIO_MAX_MS)}</span>
                </span>
                <span className="text-xs text-muted-foreground">Toque de novo para parar</span>
              </>
            ) : saving ? (
              <span className="text-sm text-muted-foreground">Guardando seu áudio…</span>
            ) : (
              <>
                <span className="text-sm font-medium text-foreground">Toque para gravar</span>
                <span className="text-xs text-muted-foreground">Até 3 minutos. Fala do seu jeito.</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          disabled={disabled}
          onClick={() => void recorder.start()}
        >
          <Plus className="size-3.5" />
          Complementar com outro áudio
        </Button>
      )}
    </div>
  )
}
