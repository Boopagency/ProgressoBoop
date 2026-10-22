"use client"

import { HeartHandshake, Send } from "lucide-react"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sendPortalReferral } from "@/features/portal/referral-actions"
import {
  EMPTY_REFERRAL,
  REFERRAL_COMPANY_MAX,
  REFERRAL_EMAIL_MAX,
  REFERRAL_NAME_MAX,
  REFERRAL_NOTE_MAX,
  REFERRAL_PHONE_MAX,
  validateReferral,
  type ReferralInput,
} from "@/features/portal/referral-logic"

/**
 * Formulário de indicação: nome de quem é indicado, empresa, WhatsApp ou
 * e-mail e um recado. Enviar grava no Comercial da Boop e limpa o formulário.
 */
export function ReferralForm({ clientId }: { clientId: string }) {
  const [fields, setFields] = useState<ReferralInput>(EMPTY_REFERRAL)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set(field: keyof ReferralInput, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = validateReferral(fields)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    startTransition(async () => {
      const result = await sendPortalReferral(clientId, parsed.data)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      setSent(parsed.data.name)
      setFields(EMPTY_REFERRAL)
      toast.success("Indicação enviada. Obrigado!")
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" noValidate>
      {sent ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-lg bg-brand-soft px-3 py-2.5 text-[13px] leading-5 text-foreground"
        >
          <HeartHandshake className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
          <span>
            Recebemos a indicação de <strong className="font-semibold">{sent}</strong>. Nossa equipe comercial vai entrar
            em contato. Muito obrigado pela confiança!
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="indicacao-nome">Nome de quem você indica</Label>
          <Input
            id="indicacao-nome"
            value={fields.name}
            onChange={(event) => set("name", event.target.value)}
            maxLength={REFERRAL_NAME_MAX}
            autoComplete="off"
            placeholder="Ex.: Ana Souza"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indicacao-empresa">
            Empresa <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="indicacao-empresa"
            value={fields.company}
            onChange={(event) => set("company", event.target.value)}
            maxLength={REFERRAL_COMPANY_MAX}
            autoComplete="off"
            placeholder="Ex.: Padaria Bom Dia"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indicacao-whatsapp">WhatsApp</Label>
          <Input
            id="indicacao-whatsapp"
            type="tel"
            inputMode="tel"
            value={fields.phone}
            onChange={(event) => set("phone", event.target.value)}
            maxLength={REFERRAL_PHONE_MAX}
            autoComplete="off"
            placeholder="(41) 99999-9999"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indicacao-email">E-mail</Label>
          <Input
            id="indicacao-email"
            type="email"
            inputMode="email"
            value={fields.email}
            onChange={(event) => set("email", event.target.value)}
            maxLength={REFERRAL_EMAIL_MAX}
            autoComplete="off"
            placeholder="ana@empresa.com.br"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Basta um dos dois: WhatsApp ou e-mail.</p>

      <div className="space-y-1.5">
        <Label htmlFor="indicacao-recado">
          Do que a pessoa precisa? <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="indicacao-recado"
          value={fields.note}
          onChange={(event) => set("note", event.target.value)}
          maxLength={REFERRAL_NOTE_MAX}
          rows={4}
          placeholder="Ex.: Quer cuidar do Instagram da loja e já sabe que vamos ligar."
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="w-full gap-1.5 sm:w-auto">
          <Send />
          {pending ? "Enviando…" : "Enviar indicação"}
        </Button>
      </div>
    </form>
  )
}
