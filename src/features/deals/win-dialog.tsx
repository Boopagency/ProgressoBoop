"use client"

import { CalendarDays, Trophy } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addPeriods, periodLabel, periodOf } from "@/features/clients/logic"
import { winDeal } from "@/features/deals/actions"
import { defaultContractStart } from "@/features/deals/logic"
import { formatMoney } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import type { DateKey, Deal } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "none"
const TERMS = [3, 6, 12, 18, 24, 36]

/**
 * Negócio ganho: escolhe o cliente (novo ou da casa) e o que nasce no sistema
 * (contrato recorrente no financeiro, entrada pontual e projeto).
 */
export function WinDialog({ deal, onOpenChange }: { deal: Deal | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={deal !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[5%] max-h-[92svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[8%] sm:max-w-[560px]">
        <DialogTitle className="sr-only">Negócio ganho</DialogTitle>
        <DialogDescription className="sr-only">Cliente, contrato, entrada pontual e projeto do negócio ganho.</DialogDescription>
        {deal ? <WinForm key={deal.id} deal={deal} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Option({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cn("rounded-lg border p-3 transition-colors", checked ? "bg-card" : "bg-muted/30")}>
      <label className="flex items-start gap-2 text-[13px] font-medium text-foreground">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
        <span>{title}</span>
      </label>
      {checked && children ? <div className="mt-3 pl-6">{children}</div> : null}
    </div>
  )
}

function WinForm({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const ids = useId()
  const router = useRouter()
  const { clients } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [mode, setMode] = useState<"new" | "existing">(deal.client_id ? "existing" : "new")
  const [clientId, setClientId] = useState<string | null>(deal.client_id)
  const [clientName, setClientName] = useState(deal.company ?? deal.title)
  const [contract, setContract] = useState(deal.recurring_cents > 0)
  const [day, setDay] = useState("10")
  const [startsOn, setStartsOn] = useState<DateKey>(defaultContractStart(today))
  const [months, setMonths] = useState<number | null>(deal.term_months)
  const [oneTime, setOneTime] = useState(deal.one_time_cents > 0)
  const [oneTimeDue, setOneTimeDue] = useState<DateKey>(today)
  const [project, setProject] = useState(true)
  const [projectName, setProjectName] = useState(deal.title)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const startOptions = Array.from({ length: 7 }, (_, index) => addPeriods(periodOf(today), index - 1))

  function submit() {
    const dayNumber = Number(day)
    if (mode === "existing" && !clientId) return setError("Escolha o cliente.")
    if (mode === "new" && !clientName.trim()) return setError("Informe o nome do cliente.")
    if (contract && (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31)) return setError("Dia do vencimento entre 1 e 31.")
    if (project && !projectName.trim()) return setError("Dê um nome ao projeto.")
    setError(null)
    startTransition(async () => {
      const result = await winDeal(deal.id, {
        client_id: mode === "existing" ? clientId : null,
        client_name: mode === "new" ? clientName : null,
        contract_day: contract ? dayNumber : null,
        contract_starts_on: contract ? startsOn : null,
        contract_months: contract ? months : null,
        one_time_due_on: oneTime ? oneTimeDue : null,
        project_name: project ? projectName : null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const created = [
        result.data.client_created ? "cliente" : null,
        result.data.recurrence_id ? "contrato" : null,
        result.data.entry_id ? "entrada" : null,
        result.data.project_id ? "projeto" : null,
      ].filter(Boolean)
      toast.success("Negócio ganho", {
        description: created.length > 0 ? `Criados: ${created.join(", ")}.` : deal.title,
        action: { label: "Ver cliente", onClick: () => router.push(`/clientes/${result.data.client_id}`) },
      })
      onDone()
    })
  }

  return (
    <form
      className="flex max-h-[92svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-brand-ink">
          <Trophy className="size-3.5" aria-hidden="true" />
          Negócio ganho
        </p>
        <h2 className="mt-1 text-lg leading-7 font-semibold tracking-tight text-foreground">{deal.title}</h2>
        <p className="text-xs text-muted-foreground">Nada é copiado à mão: o que você marcar abaixo nasce ligado a este negócio.</p>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border p-3">
            <p className="text-[13px] font-medium text-foreground">Cliente</p>
            <div role="radiogroup" aria-label="Cliente" className="mt-2 inline-flex rounded-lg bg-muted p-0.5">
              {(["new", "existing"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  onClick={() => setMode(option)}
                  className={cn(
                    "h-7 rounded-md px-3 text-[13px] font-medium text-muted-foreground",
                    mode === option && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
                  )}
                >
                  {option === "new" ? "Cliente novo" : "Cliente da casa"}
                </button>
              ))}
            </div>
            {mode === "new" ? (
              <div className="mt-3 space-y-1.5">
                <Input value={clientName} maxLength={120} onChange={(event) => setClientName(event.target.value)} aria-label="Nome do cliente" className="h-9" />
                <p className="text-xs text-muted-foreground">Se já existir um cliente com esse nome, ele é usado. O contato do negócio vai para o cadastro.</p>
              </div>
            ) : (
              <Select value={clientId ?? NONE} onValueChange={(value) => setClientId(value === NONE ? null : value)}>
                <SelectTrigger aria-label="Cliente da casa" className="mt-3 h-9 w-full shadow-none">
                  <SelectValue placeholder="Escolha o cliente" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {deal.recurring_cents > 0 ? (
            <Option checked={contract} onChange={setContract} title={`Contrato de ${formatMoney(deal.recurring_cents)} por mês no financeiro`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${ids}-day`} className="block text-xs font-medium text-muted-foreground">
                    Vence todo dia
                  </label>
                  <Input id={`${ids}-day`} inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value.replace(/\D/g, "").slice(0, 2))} className="h-9 tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Primeiro mês</p>
                  <Select value={startsOn} onValueChange={setStartsOn}>
                    <SelectTrigger aria-label="Primeiro mês" className="h-9 w-full shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {startOptions.map((period) => (
                        <SelectItem key={period} value={period}>
                          {periodLabel(period)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Duração</p>
                  <Select value={months === null ? NONE : String(months)} onValueChange={(value) => setMonths(value === NONE ? null : Number(value))}>
                    <SelectTrigger aria-label="Duração" className="h-9 w-full shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value={NONE}>Sem prazo</SelectItem>
                      {[...new Set([...TERMS, ...(months ? [months] : [])])]
                        .sort((a, b) => a - b)
                        .map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value} meses
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Option>
          ) : null}

          {deal.one_time_cents > 0 ? (
            <Option checked={oneTime} onChange={setOneTime} title={`Entrada pontual de ${formatMoney(deal.one_time_cents)} a receber`}>
              <DatePicker
                value={oneTimeDue}
                onChange={(next) => next && setOneTimeDue(next)}
                today={today}
                placeholder="Vencimento"
                aria-label="Vencimento da entrada"
                icon={<CalendarDays className="size-4 text-muted-foreground" />}
                renderValue={(value) => <span>Vence {formatShortDate(value, today)}</span>}
                className="h-9 w-full justify-start border border-input px-3 sm:w-56"
              />
            </Option>
          ) : null}

          <Option checked={project} onChange={setProject} title="Criar o projeto do cliente">
            <Input value={projectName} maxLength={200} onChange={(event) => setProjectName(event.target.value)} aria-label="Nome do projeto" className="h-9" />
          </Option>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
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
            <Trophy className="size-3.5" />
            {isPending ? "Salvando…" : "Marcar como ganho"}
          </Button>
        </div>
      </div>
    </form>
  )
}
