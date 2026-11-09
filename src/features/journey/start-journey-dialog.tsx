"use client"

import { CalendarDays, Route } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { startJourney } from "@/features/journey/actions"
import {
  JOURNEY_LINE_LABEL,
  JOURNEY_MODE_HINT,
  JOURNEY_MODE_LABEL,
  JOURNEY_PHASE_LABEL,
  type JourneyLine,
  type JourneyMode,
  type JourneyPhase,
} from "@/features/journey/catalog"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

/** Fases em que um cliente pode entrar na jornada (a saída vem só pela renovação). */
const START_PHASES: JourneyPhase[] = ["entry", "onboarding", "ongoing", "renewal"]

const PHASE_HINT: Record<JourneyPhase, string> = {
  entry: "Cliente recém-fechado: contrato, boas-vindas, acessos e kickoff.",
  onboarding: "Já passou da entrada: as sprints até a 1ª publicação.",
  ongoing: "Cliente que já está rodando (ex.: Velmont, Bárbara, Hertmann).",
  renewal: "O contrato está acabando: relatório e proposta.",
  offboarding: "",
}

export interface StartJourneyTarget {
  clientId: string | null
  /** Linhas que o cliente ainda não tem (a primeira vem escolhida). */
  lines: JourneyLine[]
}

/** "Iniciar jornada": a linha de serviço, a fase atual, o modo do onboarding e as datas. */
export function StartJourneyDialog({
  target,
  today,
  onOpenChange,
}: {
  target: StartJourneyTarget | null
  today: DateKey
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[520px]">
        <DialogTitle className="sr-only">Iniciar jornada</DialogTitle>
        <DialogDescription className="sr-only">Linha de serviço, fase atual e datas da jornada do cliente.</DialogDescription>
        {target ? <StartForm key={`${target.clientId}:${target.lines.join()}`} target={target} today={today} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function StartForm({ target, today, onDone }: { target: StartJourneyTarget; today: DateKey; onDone: () => void }) {
  const { clients } = useWorkspace()
  const [clientId, setClientId] = useState<string | null>(target.clientId)
  const [line, setLine] = useState<JourneyLine>(target.lines[0] ?? "social")
  const [phase, setPhase] = useState<JourneyPhase>(target.clientId ? "ongoing" : "entry")
  const [mode, setMode] = useState<JourneyMode>("full")
  const [startedOn, setStartedOn] = useState<DateKey>(today)
  const [contractEnd, setContractEnd] = useState<DateKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const lineOptions = (target.lines.length > 0 ? target.lines : (["social", "traffic"] as JourneyLine[])).map((value) => ({
    value,
    label: JOURNEY_LINE_LABEL[value],
  }))

  function submit() {
    if (!clientId) return setError("Escolha o cliente.")
    setError(null)
    startTransition(async () => {
      const result = await startJourney({
        client_id: clientId,
        line,
        phase,
        mode,
        phase_started_on: startedOn,
        contract_ends_on: contractEnd,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Jornada iniciada", { description: `${JOURNEY_LINE_LABEL[line]} · ${JOURNEY_PHASE_LABEL[phase]}` })
      onDone()
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="space-y-4 px-5 pt-5 pb-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-brand-ink">
            <Route className="size-3.5" aria-hidden="true" />
            Jornada do cliente
          </p>
          <h2 className="mt-1 font-display text-lg leading-7 font-medium tracking-tight text-foreground">Iniciar jornada</h2>
          <p className="text-xs text-muted-foreground">Nada muda sozinho: escolha onde o cliente está hoje. As etapas seguem o processo da Boop.</p>
        </div>

        {target.clientId ? null : (
          <Field label="Cliente">
            <Select value={clientId ?? undefined} onValueChange={setClientId}>
              <SelectTrigger aria-label="Cliente" className="h-9 w-full shadow-none">
                <SelectValue placeholder="Escolha o cliente" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {clients
                  .filter((client) => client.active)
                  .map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Linha de serviço">
          {lineOptions.length > 1 ? (
            <SegmentedControl aria-label="Linha de serviço" value={line} onValueChange={setLine} options={lineOptions} className="w-fit" />
          ) : (
            <p className="text-sm text-foreground">{lineOptions[0]?.label}</p>
          )}
        </Field>

        <Field label="Fase atual" hint={PHASE_HINT[phase]}>
          <Select value={phase} onValueChange={(value) => setPhase(value as JourneyPhase)}>
            <SelectTrigger aria-label="Fase atual" className="h-9 w-full shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {START_PHASES.map((value) => (
                <SelectItem key={value} value={value}>
                  {JOURNEY_PHASE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {line === "social" ? (
          <Field label="Onboarding" hint={JOURNEY_MODE_HINT[mode]}>
            <SegmentedControl
              aria-label="Modo do onboarding"
              value={mode}
              onValueChange={setMode}
              options={(["full", "compact"] as const).map((value) => ({ value, label: JOURNEY_MODE_LABEL[value] }))}
              className="w-fit"
            />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="A fase começou em">
            <DatePicker
              value={startedOn}
              onChange={(next) => next && setStartedOn(next > today ? today : next)}
              today={today}
              placeholder="Data"
              aria-label="Começo da fase"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          <Field label="Fim do contrato (opcional)">
            <DatePicker
              value={contractEnd}
              onChange={setContractEnd}
              today={today}
              placeholder="Pelo Financeiro"
              clearLabel="Sem data"
              aria-label="Fim do contrato"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <span />
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
            <Route className="size-3.5" />
            {isPending ? "Iniciando…" : "Iniciar jornada"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
