"use client"

import { ArrowRight, CalendarDays, ChevronDown, MoreHorizontal, Plus, Route } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { advancePhase, decideRenewal, endJourney, updateJourney } from "@/features/journey/actions"
import { JOURNEY_LINE_LABEL, JOURNEY_MODE_LABEL, JOURNEY_PHASE_LABEL } from "@/features/journey/catalog"
import { ActorPill, LineBadge, PhaseTrack, StepClock, StepRow } from "@/features/journey/journey-ui"
import { evaluateJourney, missingLines, RENEWAL_NOTICE_DAYS, type JourneyRecord, type JourneyStatus } from "@/features/journey/logic"
import { StartJourneyDialog, type StartJourneyTarget } from "@/features/journey/start-journey-dialog"
import { formatDayMonth, formatShortDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Etapas sempre à vista: a atual e as duas seguintes. O resto abre em "Ver todas". */
const VISIBLE_PENDING = 3

/**
 * Barra de etapas no topo da ficha do cliente: a fase, a etapa atual, o que
 * falta e quem age, com as ações de marcar. O briefing continua na aba dele;
 * a barra só aponta para lá.
 */
export function JourneyBar({ clientId, journeys, today }: { clientId: string; journeys: JourneyRecord[]; today: DateKey }) {
  const [start, setStart] = useState<StartJourneyTarget | null>(null)
  const active = journeys.filter((journey) => !journey.ended_on)
  const missing = missingLines(active)

  return (
    <section aria-label="Jornada do cliente" className="space-y-3">
      {active.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card px-5 py-4 sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-glass-edge bg-card text-brand-ink shadow-[0_0_20px_-6px_var(--glow)]"
          >
            <Route className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-foreground">Fora da jornada</p>
            <p className="text-[13px] text-muted-foreground">Escolha a linha de serviço e em que fase o cliente está hoje.</p>
          </div>
          <Button size="sm" className="gap-1.5 self-start sm:self-auto" onClick={() => setStart({ clientId, lines: missing })}>
            <Route className="size-3.5" />
            Iniciar jornada
          </Button>
        </div>
      ) : (
        active.map((journey) => <JourneyCard key={journey.id} record={journey} today={today} />)
      )}
      {active.length > 0 && missing.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setStart({ clientId, lines: missing })}
        >
          <Plus className="size-3.5" />
          Jornada de {missing.map((line) => JOURNEY_LINE_LABEL[line].toLocaleLowerCase("pt-BR")).join(" ou ")}
        </Button>
      ) : null}
      <StartJourneyDialog target={start} today={today} onOpenChange={(open) => !open && setStart(null)} />
    </section>
  )
}

function JourneyCard({ record, today }: { record: JourneyRecord; today: DateKey }) {
  const status = evaluateJourney(record, today)
  const [expanded, setExpanded] = useState(false)
  const [dateDialog, setDateDialog] = useState<"contract" | "renewed" | null>(null)
  const [isPending, startTransition] = useTransition()
  const briefingHref = `/clientes/${record.client_id}?aba=briefing`

  const shown = expanded ? status.steps : status.pending.slice(0, VISIBLE_PENDING)
  const hidden = status.steps.length - shown.length

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await task()
      if (!result.ok) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <article
      aria-label={`Jornada de ${JOURNEY_LINE_LABEL[record.line]}`}
      className={cn("overflow-hidden rounded-2xl border bg-card", isPending && "opacity-70")}
    >
      <header className="space-y-4 px-5 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-brand-ink">Jornada</span>
          <LineBadge line={record.line} />
          {record.line === "social" && (record.phase === "entry" || record.phase === "onboarding") ? (
            <span className="text-xs text-muted-foreground">Onboarding {JOURNEY_MODE_LABEL[record.mode].toLocaleLowerCase("pt-BR")}</span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Mais ações da jornada">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {record.line === "social" ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      () => updateJourney({ journey_id: record.id, mode: record.mode === "full" ? "compact" : "full" }),
                      "Modo do onboarding trocado"
                    )
                  }
                >
                  Onboarding {record.mode === "full" ? "compacto (Básico)" : "completo"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setDateDialog("contract")}>
                <CalendarDays />
                Fim do contrato…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => run(() => endJourney(record.id), "Jornada encerrada")}
              >
                Encerrar jornada
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <PhaseTrack phase={record.phase} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="eyebrow text-subtle-foreground">
              {JOURNEY_PHASE_LABEL[record.phase]}
              {record.phase === "ongoing" ? ` · ${monthLabel(status.round)}` : ""} · {status.done} de {status.total}
            </p>
            {status.current ? (
              <>
                <p className="font-display text-[19px] leading-7 font-medium tracking-tight text-foreground">{status.current.step.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ActorPill actor={status.current.step.actor} />
                  <StepClock status={status} />
                </div>
              </>
            ) : (
              <p className="font-display text-[19px] leading-7 font-medium tracking-tight text-foreground">
                {record.phase === "ongoing" ? "Mês em dia" : "Fase concluída"}
              </p>
            )}
            <ContractLine status={status} />
          </div>
          <PhaseActions
            status={status}
            pending={isPending}
            onAdvance={() =>
              run(() => advancePhase(record.id), record.phase === "offboarding" ? "Jornada encerrada" : "Fase andou")
            }
            onRenewed={() => setDateDialog("renewed")}
            onNotRenewed={() => run(() => decideRenewal({ journey_id: record.id, renewed: false }), "Saída iniciada")}
          />
        </div>
      </header>

      {shown.length > 0 ? (
        <ul className="divide-y border-t">
          {shown.map((step) => (
            <StepRow
              key={step.step.key}
              journeyId={record.id}
              step={step}
              current={step === status.current}
              briefingHref={step.step.section === "briefing" ? briefingHref : undefined}
            />
          ))}
        </ul>
      ) : null}
      {status.steps.length > 0 && (hidden > 0 || expanded) ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          {expanded ? "Só o que falta" : `Ver todas as ${status.steps.length} etapas da fase`}
        </button>
      ) : null}

      <DateDialog
        open={dateDialog !== null}
        title={dateDialog === "renewed" ? "Renovou" : "Fim do contrato"}
        description={
          dateDialog === "renewed"
            ? "O cliente volta para o ongoing. Informe o novo fim do contrato, se houver."
            : "Sem data aqui, vale o fim das recorrências do Financeiro. O aviso sai 30 dias antes."
        }
        initial={dateDialog === "renewed" ? null : record.contract_ends_on}
        today={today}
        onOpenChange={(open) => !open && setDateDialog(null)}
        onSave={(value) => {
          const kind = dateDialog
          setDateDialog(null)
          if (kind === "renewed") {
            run(() => decideRenewal({ journey_id: record.id, renewed: true, contract_ends_on: value }), "Renovado: de volta ao ongoing")
          } else {
            run(() => updateJourney({ journey_id: record.id, contract_ends_on: value }), "Fim do contrato salvo")
          }
        }}
      />
    </article>
  )
}

function monthLabel(round: string): string {
  const [year, month] = round.split("-")
  const name = new Date(Date.UTC(Number(year), Number(month) - 1, 15)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" })
  return name
}

function ContractLine({ status }: { status: JourneyStatus }) {
  if (!status.contract_ends_on || status.contract_days === null) return null
  const soon = status.contract_days <= RENEWAL_NOTICE_DAYS
  return (
    <p className={cn("text-xs", soon ? "font-medium text-warning-ink" : "text-muted-foreground")}>
      Contrato até {formatDayMonth(status.contract_ends_on)}
      {status.contract_days >= 0 ? ` · ${status.contract_days === 1 ? "falta 1 dia" : `faltam ${status.contract_days} dias`}` : " · já acabou"}
    </p>
  )
}

function PhaseActions({
  status,
  pending,
  onAdvance,
  onRenewed,
  onNotRenewed,
}: {
  status: JourneyStatus
  pending: boolean
  onAdvance: () => void
  onRenewed: () => void
  onNotRenewed: () => void
}) {
  const phase = status.record.phase
  if (phase === "renewal") {
    return (
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" className="shadow-none" disabled={pending} onClick={onNotRenewed}>
          Não vai renovar
        </Button>
        <Button size="sm" disabled={pending} onClick={onRenewed}>
          Renovou
        </Button>
      </div>
    )
  }
  if (phase === "ongoing") {
    const soon = status.contract_days !== null && status.contract_days <= RENEWAL_NOTICE_DAYS
    return (
      <Button variant={soon ? "default" : "ghost"} size="sm" className="shrink-0 gap-1.5 self-start sm:self-auto" disabled={pending} onClick={onAdvance}>
        Iniciar renovação
        <ArrowRight className="size-3.5" />
      </Button>
    )
  }
  if (!status.complete) return null
  return (
    <Button size="sm" className="shrink-0 gap-1.5 self-start sm:self-auto" disabled={pending} onClick={onAdvance}>
      {phase === "offboarding" ? "Encerrar jornada" : `Avançar para ${JOURNEY_PHASE_LABEL[status.next ?? "ongoing"]}`}
      <ArrowRight className="size-3.5" />
    </Button>
  )
}

function DateDialog({
  open,
  title,
  description,
  initial,
  today,
  onOpenChange,
  onSave,
}: {
  open: boolean
  title: string
  description: ReactNode
  initial: DateKey | null
  today: DateKey
  onOpenChange: (open: boolean) => void
  onSave: (value: DateKey | null) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {open ? <DateForm initial={initial} today={today} onCancel={() => onOpenChange(false)} onSave={onSave} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function DateForm({
  initial,
  today,
  onCancel,
  onSave,
}: {
  initial: DateKey | null
  today: DateKey
  onCancel: () => void
  onSave: (value: DateKey | null) => void
}) {
  const [value, setValue] = useState<DateKey | null>(initial)
  return (
    <div className="space-y-4">
      <DatePicker
        value={value}
        onChange={setValue}
        today={today}
        placeholder="Sem data"
        clearLabel="Sem data"
        aria-label="Fim do contrato"
        icon={<CalendarDays className="size-4 text-muted-foreground" />}
        renderValue={(date) => <span>{formatShortDate(date, today)}</span>}
        className="h-9 w-full justify-start border border-input px-3"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => onSave(value)}>
          Salvar
        </Button>
      </div>
    </div>
  )
}

