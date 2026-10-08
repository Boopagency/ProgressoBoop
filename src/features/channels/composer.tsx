"use client"

import { SendHorizontal } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { BODY_MAX } from "@/features/channels/logic"
import type { WritableKind } from "@/features/channels/validation"
import { cn } from "@/lib/utils"

/**
 * Campo de escrever: Enter envia, Shift + Enter quebra a linha. No canal de
 * cliente, "Pedido de ajuste" marca a mensagem como pedido (fica pendente
 * até ser resolvido).
 */
export function Composer({
  onSend,
  allowRequest,
  placeholder,
  disabledText,
  autoFocus = false,
  className,
}: {
  /** Devolve true quando enviou (aí o campo limpa). */
  onSend: (body: string, kind: WritableKind) => Promise<boolean>
  allowRequest: boolean
  placeholder: string
  /** Canal arquivado (ou sem canal): o campo vira um aviso. */
  disabledText?: string | null
  autoFocus?: boolean
  className?: string
}) {
  const [body, setBody] = useState("")
  const [request, setRequest] = useState(false)
  const [sending, setSending] = useState(false)

  // O campo limpa na hora de enviar; se der erro, o texto volta (sem apagar
  // o que a pessoa já começou a escrever de novo).
  async function send() {
    const text = body.trim()
    if (!text || sending) return
    const kind: WritableKind = allowRequest && request ? "change_request" : "text"
    setSending(true)
    setBody("")
    setRequest(false)
    const sent = await onSend(text, kind)
    setSending(false)
    if (!sent) {
      setBody((current) => current || text)
      setRequest(kind === "change_request")
    }
  }

  if (disabledText) {
    return (
      <div className={cn("border-t px-4 py-3", className)}>
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-center text-xs text-muted-foreground">{disabledText}</p>
      </div>
    )
  }

  return (
    <form
      className={cn("@container border-t bg-background px-3 py-3 sm:px-4", className)}
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div
        className={cn(
          "rounded-xl border bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20",
          request && "border-amber-600/30 bg-amber-50/30"
        )}
      >
        <textarea
          autoFocus={autoFocus}
          value={body}
          maxLength={BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder={request ? "Qual ajuste o cliente pediu?" : placeholder}
          aria-label="Mensagem"
          className="field-sizing-content block max-h-48 min-h-10 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-6 outline-none placeholder:text-subtle-foreground"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          {allowRequest ? (
            <button
              type="button"
              aria-pressed={request}
              onClick={() => setRequest((value) => !value)}
              className={cn(
                "h-7 shrink-0 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                request
                  ? "border-amber-600/25 bg-amber-50 font-medium text-amber-800"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Pedido de ajuste
            </button>
          ) : null}
          <span className="hidden truncate text-[11px] text-subtle-foreground @lg:inline">Enter envia · Shift + Enter quebra a linha</span>
          <Button type="submit" size="sm" disabled={sending || !body.trim()} className="ml-auto h-8 gap-1.5" aria-label="Enviar">
            <SendHorizontal className="size-3.5" />
            <span className="max-sm:sr-only">Enviar</span>
          </Button>
        </div>
      </div>
    </form>
  )
}
