"use client"

import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addClient, updateClient } from "@/features/clients/actions"
import { SERVICE_SUGGESTIONS } from "@/features/clients/logic"
import { NAME_MAX, NOTES_MAX, SERVICE_MAX, SERVICES_MAX, type ClientInput } from "@/features/clients/validation"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"
import type { ClientDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ClientDialogState {
  open: boolean
  key: number
  /** Cliente em edição; ausente para cadastrar um novo. */
  client?: ClientDetail
}

const NONE = "none"
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

export function ClientDialog({
  state,
  onOpenChange,
}: {
  state: ClientDialogState
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[5%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[8%] sm:max-w-[620px]"
      >
        <DialogTitle className="sr-only">{state.client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        <DialogDescription className="sr-only">
          Nome, responsável, frentes de trabalho, contato e revisão mensal.
        </DialogDescription>
        <ClientForm key={state.key} client={state.client} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function ClientForm({ client, onDone }: { client?: ClientDetail; onDone: () => void }) {
  const router = useRouter()
  const ids = useId()
  const { profiles } = useWorkspace()
  const [name, setName] = useState(client?.name ?? "")
  const [ownerId, setOwnerId] = useState<string | null>(client?.owner_id ?? null)
  const [services, setServices] = useState<string[]>(client?.services ?? [])
  const [serviceDraft, setServiceDraft] = useState("")
  const [sinceMonth, setSinceMonth] = useState(client?.since ? client.since.slice(5, 7) : NONE)
  const [sinceYear, setSinceYear] = useState(client?.since ? client.since.slice(0, 4) : NONE)
  const [contactName, setContactName] = useState(client?.contact_name ?? "")
  const [contactEmail, setContactEmail] = useState(client?.contact_email ?? "")
  const [contactPhone, setContactPhone] = useState(client?.contact_phone ?? "")
  const [reviews, setReviews] = useState(client ? client.review_day !== null : true)
  const [reviewDay, setReviewDay] = useState(String(client?.review_day ?? 10))
  const [notes, setNotes] = useState(client?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [years] = useState(() => {
    const currentYear = Number(todayKey().slice(0, 4))
    return Array.from({ length: 15 }, (_, index) => String(currentYear - index))
  })

  function addService(value: string) {
    const service = value.replace(/\s+/g, " ").trim().slice(0, SERVICE_MAX)
    if (!service) return
    setServices((current) =>
      current.some((existing) => existing.toLocaleLowerCase("pt-BR") === service.toLocaleLowerCase("pt-BR")) ||
      current.length >= SERVICES_MAX
        ? current
        : [...current, service]
    )
    setServiceDraft("")
  }

  function submit() {
    if (isPending) return
    if (!name.trim()) {
      setError("Dê um nome ao cliente.")
      return
    }
    const pending = serviceDraft.trim()
    const input: ClientInput = {
      name,
      owner_id: ownerId,
      services: pending ? [...services, pending] : services,
      since: sinceMonth !== NONE && sinceYear !== NONE ? `${sinceYear}-${sinceMonth}-01` : null,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      notes,
      review_day: reviews ? Number(reviewDay) : null,
    }
    setError(null)
    startTransition(async () => {
      const result = client ? await updateClient(client.id, input) : await addClient(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onDone()
      if (client) {
        toast.success("Cliente atualizado", { description: name.trim() })
      } else {
        toast.success("Cliente cadastrado", { description: name.trim() })
        if (result.data) router.push(`/clientes/${result.data.id}`)
      }
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex max-h-[90svh] flex-col"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-5 pb-5">
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">{client ? "Editar cliente" : "Novo cliente"}</p>
          <input
            autoFocus={!client}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
            placeholder="Nome do cliente"
            aria-label="Nome do cliente"
            maxLength={NAME_MAX}
            className="w-full bg-transparent font-display text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-sans placeholder:font-normal placeholder:text-subtle-foreground"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsável da Boop">
            <Select value={ownerId ?? NONE} onValueChange={(value) => setOwnerId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Responsável" className="w-full shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Ninguém em especial
                </SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente desde">
            <div className="flex gap-2">
              <Select value={sinceMonth} onValueChange={setSinceMonth}>
                <SelectTrigger aria-label="Mês" className="w-full shadow-none">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value={NONE} className="text-muted-foreground">
                    Mês
                  </SelectItem>
                  {MONTHS.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1).padStart(2, "0")}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sinceYear} onValueChange={setSinceYear}>
                <SelectTrigger aria-label="Ano" className="w-full shadow-none">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value={NONE} className="text-muted-foreground">
                    Ano
                  </SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>

        <Field label="Frentes de trabalho" htmlFor={`${ids}-frente`}>
          {services.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {services.map((service) => (
                <li key={service}>
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/50 pr-1 pl-2.5 text-[13px] text-foreground">
                    {service}
                    <button
                      type="button"
                      aria-label={`Tirar ${service}`}
                      onClick={() => setServices((current) => current.filter((item) => item !== service))}
                      className="grid size-5 place-content-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Input
              id={`${ids}-frente`}
              value={serviceDraft}
              onChange={(event) => setServiceDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addService(serviceDraft)
                }
              }}
              maxLength={SERVICE_MAX}
              placeholder="Outra frente (Enter adiciona)"
              className="shadow-none"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Adicionar frente"
              disabled={!serviceDraft.trim()}
              onClick={() => addService(serviceDraft)}
              className="shrink-0 shadow-none"
            >
              <Plus />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {SERVICE_SUGGESTIONS.filter(
              (suggestion) => !services.some((service) => service.toLocaleLowerCase("pt-BR") === suggestion.toLocaleLowerCase("pt-BR"))
            ).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addService(suggestion)}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" aria-hidden="true" />
                {suggestion}
              </button>
            ))}
          </div>
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Contato no cliente</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Nome"
              aria-label="Nome do contato"
              maxLength={120}
              className="shadow-none"
            />
            <Input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="E-mail"
              aria-label="E-mail do contato"
              maxLength={200}
              className="shadow-none"
            />
            <Input
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="Telefone / WhatsApp"
              aria-label="Telefone do contato"
              maxLength={40}
              className="shadow-none"
            />
          </div>
        </fieldset>

        <div className="rounded-lg border bg-muted/30 px-3 py-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${ids}-revisao`}
              checked={reviews}
              onCheckedChange={(checked) => setReviews(checked === true)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor={`${ids}-revisao`} className="text-sm font-medium text-foreground">
                Revisão mensal
              </label>
              <p className="text-xs text-muted-foreground">
                Saúde, checklist e próximos passos, uma vez por mês. Aparece na tela Hoje e na weekly quando vence.
              </p>
              {reviews ? (
                <div className="mt-2 flex items-center gap-2 text-[13px] text-foreground">
                  Vence no dia
                  <Select value={reviewDay} onValueChange={setReviewDay}>
                    <SelectTrigger size="sm" aria-label="Dia da revisão" className="w-20 bg-background shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" className="max-h-64">
                      {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  de cada mês
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <Field label="Observações" htmlFor={`${ids}-obs`}>
          <Textarea
            id={`${ids}-obs`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={NOTES_MAX}
            rows={3}
            placeholder="Contexto que a equipe precisa saber: como o cliente gosta de trabalhar, combinados especiais…"
            className="shadow-none"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? (client ? "As mudanças valem para todo o portal." : "Só o nome é obrigatório.")}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : client ? "Salvar" : "Cadastrar cliente"}
          </Button>
        </div>
      </div>
    </form>
  )
}
