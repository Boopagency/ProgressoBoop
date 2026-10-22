"use client"

import { Loader2, Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { audioSrc, formatAudioTime } from "@/features/voice/logic"
import { cn } from "@/lib/utils"

/** Só um áudio toca por vez: dar play em outro pausa o que estava tocando. */
let playing: HTMLAudioElement | null = null

const SPEEDS = [1, 1.5, 2] as const

/**
 * Mensagem de voz no fio: play/pausa, a barra de progresso (toque para pular)
 * e o tempo; enquanto toca, a velocidade (1×, 1,5×, 2×). O arquivo só carrega
 * no primeiro play. A duração vem do banco (o webm gravado no navegador não
 * diz a dele).
 */
export function AudioPlayer({ messageId, durationMs, mine = false }: { messageId: string; durationMs: number; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<"paused" | "loading" | "playing">("paused")
  const [positionMs, setPositionMs] = useState(0)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const [failed, setFailed] = useState(false)
  const started = positionMs > 0 || state !== "paused"
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0

  useEffect(
    () => () => {
      if (playing === audio.current) playing = null
    },
    []
  )

  async function toggle() {
    const element = audio.current
    if (!element) return
    if (!element.paused) {
      element.pause()
      return
    }
    if (playing && playing !== element) playing.pause()
    playing = element
    element.playbackRate = speed
    setFailed(false)
    setState("loading")
    try {
      await element.play()
    } catch {
      setState("paused")
      setFailed(true)
    }
  }

  function seek(fraction: number) {
    const element = audio.current
    if (!element || durationMs <= 0) return
    const target = Math.max(0, Math.min(fraction, 1)) * durationMs
    setPositionMs(target)
    if (element.readyState > 0) element.currentTime = target / 1000
  }

  function nextSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
  }

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audio}
        src={audioSrc(messageId)}
        preload="none"
        onPlaying={() => setState("playing")}
        onWaiting={() => setState("loading")}
        onPause={() => setState("paused")}
        onTimeUpdate={(event) => setPositionMs(event.currentTarget.currentTime * 1000)}
        onEnded={() => {
          setState("paused")
          setPositionMs(0)
        }}
        onError={() => {
          setState("paused")
          setFailed(true)
        }}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={state === "paused" ? "Ouvir o áudio" : "Pausar o áudio"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-white outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/40",
          mine ? "bg-brand-ink" : "bg-brand"
        )}
      >
        {state === "loading" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : state === "playing" ? (
          <Pause className="size-4 fill-current" aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(positionMs / 1000)}
          aria-valuetext={formatAudioTime(positionMs)}
          onPointerDown={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            seek((event.clientX - box.left) / box.width)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") seek((positionMs + 5000) / durationMs)
            else if (event.key === "ArrowLeft") seek((positionMs - 5000) / durationMs)
            else return
            event.preventDefault()
          }}
          className="group relative flex h-5 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/15">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
          </div>
          <span
            className="absolute size-3 -translate-x-1/2 rounded-full bg-brand shadow-sm"
            style={{ left: `${progress * 100}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] leading-4 text-muted-foreground tabular-nums">
          <span>{failed ? "Não deu para tocar. Tente de novo." : formatAudioTime(started ? positionMs : durationMs)}</span>
          {started ? (
            <button
              type="button"
              onClick={nextSpeed}
              aria-label={`Velocidade ${speed}×. Trocar`}
              className="rounded-full bg-foreground/10 px-1.5 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {String(speed).replace(".", ",")}×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
