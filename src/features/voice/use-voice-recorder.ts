"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { AUDIO_BITS_PER_SECOND, AUDIO_MAX_MS, RECORDING_TYPES } from "@/features/voice/logic"
import type { Recording } from "@/features/voice/upload"

export type RecorderStatus = "idle" | "starting" | "recording"

interface Session {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  startedAt: number
  timer: number
  /** Nível do microfone para a onda (só com `analyse`). */
  meter: { context: AudioContext; analyser: AnalyserNode; buffer: Uint8Array<ArrayBuffer> } | null
}

/** Este navegador grava áudio (microfone e MediaRecorder). */
function canRecordAudio(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
}

const noSubscription = () => () => undefined

/** Se o navegador grava áudio (no servidor e na primeira pintura, não). */
export function useCanRecordAudio(): boolean {
  return useSyncExternalStore(noSubscription, canRecordAudio, () => false)
}

/** Liga o microfone a um analisador para medir o volume (a onda enquanto grava). */
function createMeter(stream: MediaStream): Session["meter"] {
  try {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    // Alguns navegadores criam o contexto suspenso; o toque em gravar libera.
    if (context.state === "suspended") void context.resume().catch(() => undefined)
    return { context, analyser, buffer: new Uint8Array(new ArrayBuffer(analyser.fftSize)) }
  } catch {
    return null
  }
}

/**
 * Gravador de voz: pede o microfone, grava no formato que o navegador
 * suporta (mp4 de preferência) e entrega o arquivo com a duração. Para
 * sozinho no limite (`maxMs`, 5 minutos por padrão; chama `onLimit`). Com
 * `analyse`, `readLevel()` dá o volume do momento (0 a 1) para desenhar a
 * onda. Sair da tela solta o microfone.
 */
export function useVoiceRecorder({
  onLimit,
  maxMs = AUDIO_MAX_MS,
  analyse = false,
}: { onLimit?: () => void; maxMs?: number; analyse?: boolean } = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const session = useRef<Session | null>(null)
  const limit = useRef(onLimit)

  useEffect(() => {
    limit.current = onLimit
  })

  function release(current: Session) {
    window.clearInterval(current.timer)
    if (current.meter) void current.meter.context.close().catch(() => undefined)
    for (const track of current.stream.getTracks()) track.stop()
    if (session.current === current) session.current = null
  }

  useEffect(
    () => () => {
      const current = session.current
      if (!current) return
      current.recorder.ondataavailable = null
      if (current.recorder.state !== "inactive") current.recorder.stop()
      release(current)
    },
    []
  )

  async function start() {
    if (status !== "idle") return
    if (!canRecordAudio()) {
      toast.error("Este navegador não grava áudio.")
      return
    }
    setStatus("starting")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (error) {
      setStatus("idle")
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
      toast.error(
        denied
          ? "Libere o microfone para gravar: no cadeado ao lado do endereço (computador) ou nos ajustes do navegador (celular)."
          : "Não foi possível usar o microfone."
      )
      return
    }
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
    } catch {
      for (const track of stream.getTracks()) track.stop()
      setStatus("idle")
      toast.error("Não foi possível gravar neste navegador.")
      return
    }
    const current: Session = {
      recorder,
      stream,
      chunks: [],
      startedAt: performance.now(),
      timer: 0,
      meter: analyse ? createMeter(stream) : null,
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) current.chunks.push(event.data)
    }
    recorder.start(250)
    current.startedAt = performance.now()
    current.timer = window.setInterval(() => {
      const elapsed = performance.now() - current.startedAt
      setElapsedMs(elapsed)
      if (elapsed >= maxMs) limit.current?.()
    }, 200)
    session.current = current
    setElapsedMs(0)
    setStatus("recording")
  }

  /** Para e entrega a gravação (null se não estava gravando ou não veio nada). */
  function finish(): Promise<Recording | null> {
    const current = session.current
    if (!current) return Promise.resolve(null)
    const durationMs = Math.min(Math.round(performance.now() - current.startedAt), maxMs)
    // Solta já: o limite não chama de novo enquanto o gravador fecha.
    window.clearInterval(current.timer)
    session.current = null
    setStatus("idle")
    return new Promise((resolve) => {
      current.recorder.onstop = () => {
        release(current)
        const mimeType = current.recorder.mimeType || current.chunks[0]?.type || ""
        const blob = new Blob(current.chunks, { type: mimeType })
        resolve(blob.size > 0 ? { blob, mimeType, durationMs } : null)
      }
      if (current.recorder.state === "inactive") current.recorder.onstop(new Event("stop"))
      else current.recorder.stop()
    })
  }

  /** Para e joga fora. */
  function cancel() {
    const current = session.current
    setStatus("idle")
    if (!current) return
    current.recorder.ondataavailable = null
    current.recorder.onstop = null
    if (current.recorder.state !== "inactive") current.recorder.stop()
    release(current)
  }

  /** Volume do microfone agora, de 0 a 1 (0 sem `analyse` ou fora da gravação). */
  function readLevel(): number {
    const meter = session.current?.meter
    if (!meter) return 0
    meter.analyser.getByteTimeDomainData(meter.buffer)
    let sum = 0
    for (const sample of meter.buffer) {
      const centered = (sample - 128) / 128
      sum += centered * centered
    }
    return Math.min(1, Math.sqrt(sum / meter.buffer.length) * 3)
  }

  return { status, elapsedMs, start, finish, cancel, readLevel }
}
