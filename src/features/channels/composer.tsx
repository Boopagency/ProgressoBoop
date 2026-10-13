"use client"

import { Lock, SendHorizontal } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { BODY_MAX } from "@/features/channels/logic"
import type { WritableKind } from "@/features/channels/validation"
import { cn } from "@/lib/utils"

/** Opções da mensagem além do tipo: interna (só a equipe vê, no canal do cliente). */
export interface ComposerOptions {
  internal: boolean
}

/**
 * Campo de escrever: Enter envia, Shift + Enter quebra a linha. No canal de
 * cliente, "Pedido de ajuste" marca a mensagem como pedido (fica pendente
 * até ser resolvido) e "Interno" a deixa só para a equipe (o cliente não vê
 * no portal). O portal usa o mesmo campo, sem as duas opções.
 */
export function Composer({
  onSend,
  allowRequest,
  allowInternal = false,
  placeholder,
  disabledText,
  autoFocus = false,
  className,
}: {
  /** Devolve true quando enviou (aí o campo limpa). */
  onSend: (body: string, kind: WritableKind, options: ComposerOptions) => Promise<boolean>
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
          request && "border-amber-600/30 bg-amber-50/30",
          allowInternal && internal && !request && "border-dashed border-foreground/25 bg-muted/50"
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
          placeholder={
            request
              ? "Qual ajuste o cliente pediu?"
              : allowInternal && internal
                ? "Mensagem interna: só a equipe vê"
                : placeholder
          }
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
          <Button type="submit" size="sm" disabled={sending || !body.trim()} className="ml-auto h-8 gap-1.5" aria-label="Enviar">
            <SendHorizontal className="size-3.5" />
            <span className="max-sm:sr-only">Enviar</span>
          </Button>
        </div>
      </div>
    </form>
  )
}
