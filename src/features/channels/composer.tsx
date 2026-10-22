"use client"

import { Lock, MessageSquareWarning, Mic, Plus, SendHorizontal, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BODY_MAX } from "@/features/channels/logic"
import { useIsMobile } from "@/hooks/use-mobile"
import type { WritableKind } from "@/features/channels/validation"
import { AUDIO_MIN_MS } from "@/features/voice/logic"
import { RecordingBar } from "@/features/voice/recording-bar"
import type { Recording } from "@/features/voice/upload"
import { useCanRecordAudio, useVoiceRecorder } from "@/features/voice/use-voice-recorder"
import { cn } from "@/lib/utils"

/** Celular com toque (o teclado da tela não tem Shift + Enter). */
const TOUCH_PHONE = "(pointer: coarse) and (max-width: 767px)"

/** Opções da mensagem além do tipo: interna (só a equipe vê, no canal do cliente). */
export interface ComposerOptions {
  internal: boolean
}

/**
 * Campo de escrever: Enter envia, Shift + Enter quebra a linha. No canal de
 * cliente, "Pedido de ajuste" marca a mensagem como pedido (fica pendente
 * até ser resolvido) e "Interno" a deixa só para a equipe (o cliente não vê
 * no portal). O portal usa o mesmo campo, sem as duas opções. `autoFocus`
 * só vale com mouse (no celular, o teclado abre quando a pessoa toca). No
 * celular, como nos aplicativos de conversa: o campo arredondado, o botão
 * redondo de enviar, as duas opções no "+" e Enter quebra a linha. Com
 * `onSendAudio`, o microfone grava uma mensagem de voz (no celular, no lugar
 * do botão de enviar enquanto o campo está vazio); enquanto grava, a barra
 * de gravação fica no lugar do campo.
 */
export function Composer({
  onSend,
  onSendAudio,
  allowRequest,
  allowInternal = false,
  placeholder,
  disabledText,
  autoFocus = false,
  className,
}: {
  /** Devolve true quando enviou (aí o campo limpa). */
  onSend: (body: string, kind: WritableKind, options: ComposerOptions) => Promise<boolean>
  /** Envia a mensagem de voz (sem isso, não aparece o microfone). Devolve true quando enviou. */
  onSendAudio?: (recording: Recording, kind: WritableKind, options: ComposerOptions) => Promise<boolean>
  allowRequest: boolean
  /** Canal do cliente, na equipe: mostra "Interno". */
  allowInternal?: boolean
  placeholder: string
  /** Canal arquivado (ou sem canal): o campo vira um aviso. */
  disabledText?: string | null
  autoFocus?: boolean
  className?: string
}) {
  const [body, setBody] = useState("")
  const [request, setRequest] = useState(false)
  const [internal, setInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()
  const [sendingAudio, setSendingAudio] = useState(false)
  const voice = useVoiceRecorder({ onLimit: () => void sendAudio() })
  const showMic = useCanRecordAudio() && !!onSendAudio

  // Abrir a conversa já deixa o cursor no campo, mas só com mouse: no
  // celular isso abriria o teclado por cima da conversa.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) field.current?.focus()
  }, [autoFocus])

  // O campo limpa na hora de enviar; se der erro, o texto volta (sem apagar
  // o que a pessoa já começou a escrever de novo).
  async function send() {
    const text = body.trim()
    if (!text || sending) return
    const kind: WritableKind = allowRequest && request ? "change_request" : "text"
    // "Interno" continua marcado depois de enviar: quem está conversando
    // entre a equipe costuma mandar mais de uma mensagem seguida.
    const options: ComposerOptions = { internal: allowInternal && internal }
    setSending(true)
    setBody("")
    setRequest(false)
    const sent = await onSend(text, kind, options)
    setSending(false)
    if (!sent) {
      setBody((current) => current || text)
      setRequest(kind === "change_request")
    }
  }

  async function sendAudio() {
    if (!onSendAudio || sendingAudio) return
    setSendingAudio(true)
    const recording = await voice.finish()
    if (!recording || recording.durationMs < AUDIO_MIN_MS) {
      setSendingAudio(false)
      if (recording) toast("Áudio muito curto. Toque no microfone, fale e toque em enviar.")
      return
    }
    const kind: WritableKind = allowRequest && request ? "change_request" : "text"
    const sent = await onSendAudio(recording, kind, { internal: allowInternal && internal })
    setSendingAudio(false)
    if (sent) setRequest(false)
  }

  if (disabledText) {
    return (
      <div className={cn("border-t px-4 py-3", className)}>
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-center text-xs text-muted-foreground">{disabledText}</p>
      </div>
    )
  }

  const internalOn = allowInternal && internal
  if (voice.status !== "idle" || sendingAudio) {
    return (
      <div className={cn("border-t bg-background px-3 py-3 sm:px-4 max-md:px-2 max-md:py-1.5", className)}>
        <RecordingBar
          status={voice.status}
          elapsedMs={voice.elapsedMs}
          sending={sendingAudio}
          onCancel={voice.cancel}
          onSend={() => void sendAudio()}
        />
      </div>
    )
  }

  return (
    <form
      className={cn(
        "@container border-t bg-background px-3 py-3 sm:px-4",
        "max-md:flex max-md:items-end max-md:gap-1.5 max-md:px-2 max-md:py-1.5",
        className
      )}
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      {allowRequest || allowInternal ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Tipo da mensagem: pedido de ajuste ou interna"
              className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/40 active:bg-muted data-[state=open]:bg-muted md:hidden"
            >
              <Plus className="size-6" aria-hidden="true" />
              {request || internalOn ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand" aria-hidden="true" /> : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            {allowRequest ? (
              <DropdownMenuCheckboxItem checked={request} onCheckedChange={(checked) => setRequest(checked === true)}>
                <MessageSquareWarning aria-hidden="true" />
                Pedido de ajuste
              </DropdownMenuCheckboxItem>
            ) : null}
            {allowInternal ? (
              <DropdownMenuCheckboxItem checked={internal} onCheckedChange={(checked) => setInternal(checked === true)}>
                <Lock aria-hidden="true" />
                Interno: só a equipe vê
              </DropdownMenuCheckboxItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div
        className={cn(
          "rounded-xl border bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20",
          "max-md:min-w-0 max-md:flex-1 max-md:rounded-[1.375rem]",
          request && "border-attention-line/30 bg-attention-soft/30",
          allowInternal && internal && !request && "border-dashed border-foreground/25 bg-muted/50"
        )}
      >
        {/* Celular: o que está marcado no "+", com o × para tirar. */}
        {request || internalOn ? (
          <div className="flex flex-wrap gap-1 px-2.5 pt-1.5 md:hidden">
            {request ? (
              <button
                type="button"
                onClick={() => setRequest(false)}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-attention-line/25 bg-attention-soft px-2 text-xs font-medium text-attention-ink"
              >
                Pedido de ajuste
                <X className="size-3" aria-label="tirar" />
              </button>
            ) : null}
            {internalOn ? (
              <button
                type="button"
                onClick={() => setInternal(false)}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-foreground/20 bg-muted px-2 text-xs font-medium text-foreground"
              >
                <Lock className="size-3" aria-hidden="true" />
                Interno
                <X className="size-3" aria-label="tirar" />
              </button>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={field}
          value={body}
          maxLength={BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // No celular (toque) não há Shift: Enter quebra a linha e o botão envia.
            if (window.matchMedia(TOUCH_PHONE).matches) return
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder={
            request
              ? "Qual ajuste o cliente pediu?"
              : allowInternal && internal
                ? "Mensagem interna: só a equipe vê"
                : isMobile
                  ? "Mensagem"
                  : placeholder
          }
          aria-label="Mensagem"
          className="field-sizing-content block max-h-48 min-h-10 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-6 outline-none placeholder:text-subtle-foreground max-md:max-h-32 max-md:px-4 max-md:py-2"
        />
        <div className="flex items-center gap-2 px-2 pb-2 max-md:hidden">
          {allowRequest ? (
            <button
              type="button"
              aria-pressed={request}
              onClick={() => setRequest((value) => !value)}
              className={cn(
                "h-7 shrink-0 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                request
                  ? "border-attention-line/25 bg-attention-soft font-medium text-attention-ink"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Pedido de ajuste
            </button>
          ) : null}
          {allowInternal ? (
            <button
              type="button"
              aria-pressed={internal}
              title="Só a equipe vê: a mensagem não aparece no portal do cliente"
              onClick={() => setInternal((value) => !value)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                internal
                  ? "border-foreground/20 bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Lock className="size-3" aria-hidden="true" />
              Interno
            </button>
          ) : null}
          <span className="hidden truncate text-[11px] text-subtle-foreground @lg:inline">Enter envia · Shift + Enter quebra a linha</span>
          {showMic ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void voice.start()}
              aria-label="Gravar áudio"
              title="Gravar áudio"
              className="ml-auto size-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Mic className="size-4" />
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={sending || !body.trim()} className={cn("h-8 gap-1.5", !showMic && "ml-auto")} aria-label="Enviar">
            <SendHorizontal className="size-3.5" />
            <span className="max-sm:sr-only">Enviar</span>
          </Button>
        </div>
      </div>
      {/* Celular: campo vazio, o microfone no lugar de enviar (como nos aplicativos de conversa). */}
      {showMic && !body.trim() ? (
        <Button
          type="button"
          size="icon"
          onClick={() => void voice.start()}
          aria-label="Gravar áudio"
          className="size-10 shrink-0 rounded-full md:hidden"
        >
          <Mic className="size-5" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={sending || !body.trim()}
          aria-label="Enviar"
          // Tocar em enviar não tira o cursor do campo: o teclado continua aberto para a próxima.
          onMouseDown={(event) => event.preventDefault()}
          className="size-10 shrink-0 rounded-full md:hidden"
        >
          <SendHorizontal className="size-5" />
        </Button>
      )}
    </form>
  )
}
