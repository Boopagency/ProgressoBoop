"use client"

import { CalendarDays, Trash2, Trophy, XCircle } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { loadActivity } from "@/features/activity/actions"
import { ActivityFeed } from "@/features/activity/activity-feed"
import { SERVICE_SUGGESTIONS } from "@/features/clients/logic"
import { createDeal, deleteDeal, updateDeal } from "@/features/deals/actions"
import { contractValue, DEFAULT_TERM_MONTHS, LOST_REASONS, probabilityOf, weightedValue } from "@/features/deals/logic"
import {
  COMPANY_MAX,
  CONTACT_MAX,
  EMAIL_MAX,
  LOST_REASON_MAX,
  NOTES_MAX,
  PHONE_MAX,
  SERVICE_MAX,
  TITLE_MAX,
} from "@/features/deals/validation"
import { formatMoney, formatMoneyShort, moneyInputValue, parseMoney } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import {
  DEAL_STAGE_LABEL,
  DEAL_STAGE_PROBABILITY,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCES,
  OPEN_DEAL_STAGES,
} from "@/lib/labels"
import type { ActivityEntry, DateKey, Deal, DealStage, LeadSource } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface DealDialogState {
  open: boolean
  key: number
  deal?: Deal
  defaults?: { stage?: DealStage; client_id?: string | null }
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"
const TERMS = [3, 6, 12, 18, 24, 36]

/** Valor digitado (pode ser vazio = zero). */
function moneyOrZero(text: string): number | null {
  if (!text.trim()) return 0
  if (/^\s*(R\$)?\s*0+([.,]0{1,2})?\s*$/.test(text)) return 0
  return parseMoney(text)
}

export function DealDialog({
  state,
  onOpenChange,
  onWin,
}: {
  state: DealDialogState
  onOpenChange: (open: boolean) => void
  /** Abre a conversão (negócio ganho). */
  onWin: (deal: Deal) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[3%] max-h-[94svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[5%] sm:max-w-[720px]"
      >
        <DialogTitle className="sr-only">{state.deal ? "Negócio" : "Novo negócio"}</DialogTitle>
        <DialogDescription className="sr-only">Lead, contato, valores, etapa e previsão de fechamento.</DialogDescription>
        <DealForm
          key={state.key}
          deal={state.deal}
          defaults={state.defaults}
          onDone={() => onOpenChange(false)}
          onWin={(deal) => {
            onOpenChange(false)
            onWin(deal)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function DealForm({
  deal,
  defaults,
  onDone,
  onWin,
}: {
  deal?: Deal
  defaults?: DealDialogState["defaults"]
  onDone: () => void
  onWin: (deal: Deal) => void
}) {
  const ids = useId()
  const { clients, profiles, currentUser, clientById, projectById } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [title, setTitle] = useState(deal?.title ?? "")
  const [clientId, setClientId] = useState<string | null>(deal ? deal.client_id : (defaults?.client_id ?? null))
  const [company, setCompany] = useState(deal?.company ?? "")
  const [contactName, setContactName] = useState(deal?.contact_name ?? "")
  const [contactEmail, setContactEmail] = useState(deal?.contact_email ?? "")
  const [contactPhone, setContactPhone] = useState(deal?.contact_phone ?? "")
  const [source, setSource] = useState<LeadSource>(deal?.source ?? (defaults?.client_id ? "existing_client" : "referral"))
  const [service, setService] = useState(deal?.service ?? "")
  const [stage, setStage] = useState<DealStage>(deal?.stage ?? defaults?.stage ?? "lead")
  const [ownerId, setOwnerId] = useState<string | null>(deal ? deal.owner_id : currentUser.id)
  const [recurring, setRecurring] = useState(deal?.recurring_cents ? moneyInputValue(deal.recurring_cents) : "")
  const [oneTime, setOneTime] = useState(deal?.one_time_cents ? moneyInputValue(deal.one_time_cents) : "")
  const [term, setTerm] = useState<number | null>(deal ? deal.term_months : DEFAULT_TERM_MONTHS)
  const [probability, setProbability] = useState(deal?.probability === null || !deal ? "" : String(deal.probability))
  const [openedOn, setOpenedOn] = useState<DateKey>(deal?.opened_on ?? today)
  const [expectedClose, setExpectedClose] = useState<DateKey | null>(deal?.expected_close_on ?? null)
  const [notes, setNotes] = useState(deal?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [losing, setLosing] = useState(false)
  const [lostReason, setLostReason] = useState(deal?.lost_reason ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  const [activityVersion, setActivityVersion] = useState(0)
  const [isPending, startTransition] = useTransition()

  const closed = deal?.stage === "won" || deal?.stage === "lost"
  const recurringCents = moneyOrZero(recurring)
  const oneTimeCents = moneyOrZero(oneTime)
  const chance = probability.trim() ? Number(probability) : null
  const preview =
    recurringCents !== null && oneTimeCents !== null
      ? { recurring_cents: recurringCents, one_time_cents: oneTimeCents, term_months: term, probability: chance, stage }
      : null

  useEffect(() => {
    if (!deal) return
    let current = true
    void loadActivity("deal", deal.id).then((result) => {
      if (current && result.ok) setActivity(result.data)
    })
    return () => {
      current = false
    }
  }, [deal, activityVersion])

  function fields() {
    if (!title.trim()) return { error: "Dê um nome ao negócio (ex.: Social media — Clínica Sorriso)." }
    if (recurringCents === null || oneTimeCents === null) return { error: "Valor inválido (ex.: 3.500,00)." }
    if (chance !== null && (!Number.isInteger(chance) || chance < 0 || chance > 100)) return { error: "Chance entre 0 e 100." }
    return {
      value: {
        title,
        client_id: clientId,
        company: company || null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        source,
        service: service || null,
        owner_id: ownerId,
        recurring_cents: recurringCents,
        one_time_cents: oneTimeCents,
        term_months: term,
        probability: chance,
        opened_on: openedOn,
        expected_close_on: expectedClose,
        notes: notes || null,
      },
    }
  }

  function submit(next?: { win?: boolean }) {
    const result = fields()
    if ("error" in result) {
      setError(result.error ?? null)
      return
    }
    setError(null)
    startTransition(async () => {
      if (deal) {
        const saved = await updateDeal(deal.id, closed ? result.value : { ...result.value, stage })
        if (!saved.ok) {
          setError(saved.error)
          return
        }
        if (next?.win) {
          onWin({ ...deal, ...result.value, stage: deal.stage })
          return
        }
        toast.success("Negócio salvo", { description: title.trim() })
        onDone()
        return
      }
      const created = await createDeal({ ...result.value, stage })
      if (!created.ok) {
        setError(created.error)
        return
      }
      toast.success("Negócio criado", { description: `${title.trim()} · ${DEAL_STAGE_LABEL[stage]}` })
      onDone()
    })
  }

  function lose() {
    if (!deal) return
    startTransition(async () => {
      const result = await updateDeal(deal.id, { stage: "lost", lost_reason: lostReason || null })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast("Negócio perdido", { description: lostReason ? `Motivo: ${lostReason}` : deal.title })
      onDone()
    })
  }

  function reopen() {
    if (!deal) return
    startTransition(async () => {
      const result = await updateDeal(deal.id, { stage: deal.stage === "won" ? "negotiation" : deal.reached_stage === "won" ? "negotiation" : deal.reached_stage })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast("Negócio reaberto", { description: deal.title })
      onDone()
    })
  }

  function remove() {
    if (!deal) return
    startTransition(async () => {
      const result = await deleteDeal(deal.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Negócio excluído", { description: deal.title })
        onDone()
      }
    })
  }

  const client = deal?.client_id ? clientById.get(deal.client_id) : undefined
  const project = deal?.project_id ? projectById.get(deal.project_id) : undefined

  return (
    <form
      className="flex max-h-[94svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        {deal && closed ? (
          <div
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-[13px]",
              deal.stage === "won" ? "bg-brand-soft/60 text-foreground" : "bg-muted text-foreground"
            )}
          >
            {deal.stage === "won" ? (
              <Trophy className="size-4 text-brand-ink" aria-hidden="true" />
            ) : (
              <XCircle className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="font-medium">
              {deal.stage === "won" ? "Ganho" : "Perdido"}
              {deal.closed_on ? ` em ${formatShortDate(deal.closed_on, today)}` : ""}
            </span>
            {deal.stage === "lost" && deal.lost_reason ? <span className="text-muted-foreground">· {deal.lost_reason}</span> : null}
            {deal.stage === "won" && client ? (
              <Link href={`/clientes/${client.id}`} className="text-brand-ink hover:underline">
                · {client.name}
              </Link>
            ) : null}
            {deal.stage === "won" && project ? (
              <Link href={`/projetos/${project.id}`} className="text-brand-ink hover:underline">
                · projeto {project.name}
              </Link>
            ) : null}
            {deal.stage === "won" && deal.recurrence_id ? (
              <Link href="/financeiro/contratos" className="text-brand-ink hover:underline">
                · contrato no financeiro
              </Link>
            ) : null}
          </div>
        ) : null}
        <input
          autoFocus={!deal}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError(null)
          }}
          maxLength={TITLE_MAX}
          placeholder="Ex.: Social media — Clínica Sorriso"
          aria-label="Nome do negócio"
          className="w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Empresa (lead)" htmlFor={`${ids}-company`}>
            <Input id={`${ids}-company`} value={company} maxLength={COMPANY_MAX} onChange={(event) => setCompany(event.target.value)} placeholder="Nome da empresa" className="h-9" />
          </Field>
          <Field label="Cliente da casa">
            <Select
              value={clientId ?? NONE}
              onValueChange={(value) => {
                const next = value === NONE ? null : value
                setClientId(next)
                if (next && !deal) setSource("existing_client")
              }}
            >
              <SelectTrigger aria-label="Cliente da casa" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Não (lead novo)</SelectItem>
                {clients
                  .filter((candidate) => candidate.active || candidate.id === clientId)
                  .map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contato" htmlFor={`${ids}-contact`}>
            <Input id={`${ids}-contact`} value={contactName} maxLength={CONTACT_MAX} onChange={(event) => setContactName(event.target.value)} placeholder="Nome" className="h-9" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail" htmlFor={`${ids}-email`}>
              <Input id={`${ids}-email`} type="email" value={contactEmail} maxLength={EMAIL_MAX} onChange={(event) => setContactEmail(event.target.value)} className="h-9" />
            </Field>
            <Field label="Telefone" htmlFor={`${ids}-phone`}>
              <Input id={`${ids}-phone`} inputMode="tel" value={contactPhone} maxLength={PHONE_MAX} onChange={(event) => setContactPhone(event.target.value)} className="h-9" />
            </Field>
          </div>
          <Field label="Origem">
            <Select value={source} onValueChange={(value) => setSource(value as LeadSource)}>
              <SelectTrigger aria-label="Origem" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {LEAD_SOURCES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {LEAD_SOURCE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Frente" htmlFor={`${ids}-service`}>
            <Input
              id={`${ids}-service`}
              list={`${ids}-services`}
              value={service}
              maxLength={SERVICE_MAX}
              onChange={(event) => setService(event.target.value)}
              placeholder="Social media"
              className="h-9"
            />
            <datalist id={`${ids}-services`}>
              {SERVICE_SUGGESTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
          <Field label="Mensal (R$)" htmlFor={`${ids}-recurring`}>
            <Input
              id={`${ids}-recurring`}
              inputMode="decimal"
              value={recurring}
              onChange={(event) => setRecurring(event.target.value)}
              onBlur={() => {
                const cents = parseMoney(recurring)
                if (cents) setRecurring(moneyInputValue(cents))
              }}
              placeholder="0,00"
              className="h-9 bg-background text-right tabular-nums"
            />
          </Field>
          <Field label="Pontual (R$)" htmlFor={`${ids}-onetime`}>
            <Input
              id={`${ids}-onetime`}
              inputMode="decimal"
              value={oneTime}
              onChange={(event) => setOneTime(event.target.value)}
              onBlur={() => {
                const cents = parseMoney(oneTime)
                if (cents) setOneTime(moneyInputValue(cents))
              }}
              placeholder="Setup, site…"
              className="h-9 bg-background text-right tabular-nums"
            />
          </Field>
          <Field label="Contrato">
            <Select value={term === null ? NONE : String(term)} onValueChange={(value) => setTerm(value === NONE ? null : Number(value))}>
              <SelectTrigger aria-label="Duração do contrato" className={cn(TRIGGER, "bg-background")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Sem prazo</SelectItem>
                {[...new Set([...TERMS, ...(term ? [term] : [])])]
                  .sort((a, b) => a - b)
                  .map((months) => (
                    <SelectItem key={months} value={String(months)}>
                      {months} meses
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-3 tabular-nums">
            {preview
              ? `Valor do contrato: ${formatMoney(contractValue(preview))}${term === null ? " (12 meses de referência)" : ""} · ponderado: ${formatMoneyShort(weightedValue(preview))} (${probabilityOf(preview)}%)`
              : "Valores inválidos."}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {!closed ? (
            <Field label="Etapa">
              <Select value={stage} onValueChange={(value) => setStage(value as DealStage)}>
                <SelectTrigger aria-label="Etapa" className={TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {OPEN_DEAL_STAGES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DEAL_STAGE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {!closed ? (
            <Field label="Chance de fechar (%)" htmlFor={`${ids}-chance`}>
              <Input
                id={`${ids}-chance`}
                inputMode="numeric"
                value={probability}
                onChange={(event) => setProbability(event.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder={`${DEAL_STAGE_PROBABILITY[stage]} (padrão da etapa)`}
                className="h-9 tabular-nums"
              />
            </Field>
          ) : null}
          <Field label="Responsável">
            <Select value={ownerId ?? NONE} onValueChange={(value) => setOwnerId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Responsável" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Ninguém</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {firstName(profile.full_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chegou em">
            <DatePicker
              value={openedOn}
              onChange={(next) => next && setOpenedOn(next)}
              today={today}
              placeholder="Data"
              aria-label="Chegou em"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          {!closed ? (
            <Field label="Previsão de fechamento">
              <DatePicker
                value={expectedClose}
                onChange={setExpectedClose}
                today={today}
                placeholder="Sem previsão"
                clearLabel="Tirar a previsão"
                aria-label="Previsão de fechamento"
                icon={<CalendarDays className="size-4 text-muted-foreground" />}
                renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
                className="h-9 w-full justify-start border border-input px-3"
              />
            </Field>
          ) : null}
        </div>

        <Field label="Observação" htmlFor={`${ids}-notes`} className="mt-4">
          <Textarea
            id={`${ids}-notes`}
            value={notes}
            maxLength={NOTES_MAX}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contexto, dores, próximos passos…"
            className="min-h-16 resize-none text-[13px] shadow-none"
          />
        </Field>

        {losing ? (
          <div className="mt-4 rounded-lg border p-3">
            <p className="text-[13px] font-medium text-foreground">Por que perdemos?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LOST_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setLostReason(reason)}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-xs transition-colors",
                    lostReason === reason ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>
            <Input
              value={lostReason}
              maxLength={LOST_REASON_MAX}
              onChange={(event) => setLostReason(event.target.value)}
              placeholder="Ou escreva o motivo"
              aria-label="Motivo da perda"
              className="mt-2 h-9"
            />
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="destructive" onClick={lose} disabled={isPending}>
                Marcar como perdido
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLosing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {deal ? (
          <section aria-label="Histórico e comentários" className="mt-5 border-t pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">Histórico e comentários</h3>
            {activity ? (
              <ActivityFeed
                entries={activity}
                target={{ type: "deal", id: deal.id }}
                onChanged={() => setActivityVersion((value) => value + 1)}
                limit={8}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
            )}
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {deal ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir negócio"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
          {deal && !closed ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLosing(true)} disabled={isPending}>
                Perdido
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => submit({ win: true })} disabled={isPending}>
                <Trophy className="size-3.5" />
                Ganho
              </Button>
            </>
          ) : null}
          {deal && closed ? (
            <Button type="button" variant="ghost" size="sm" onClick={reopen} disabled={isPending}>
              Reabrir
            </Button>
          ) : null}
          {error ? (
            <p className="w-full text-xs text-destructive sm:w-auto" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : deal ? "Salvar" : "Criar negócio"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este negócio?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deal?.title}” sai do comercial e dos indicadores. Cliente, contrato e projeto criados por ele continuam. Para
              tirar do funil sem apagar o histórico, marque como perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
