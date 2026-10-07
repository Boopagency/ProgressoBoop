"use client"

import { Trash2 } from "lucide-react"
import { useEffect, useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createKeyResult, deleteKeyResult, previewKeyResult, updateKeyResult, type KeyResultPreview } from "@/features/goals/actions"
import { inputToValue, UNIT_SUFFIX, valueToInput } from "@/features/goals/goal-values"
import { TITLE_MAX } from "@/features/goals/validation"
import type { MetricOption } from "@/features/goals/view-model"
import { METRIC_AREA_LABEL, type MetricArea } from "@/features/metrics/catalog"
import { formatMetric } from "@/features/metrics/format"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { METRIC_UNIT_LABEL, METRIC_UNITS } from "@/lib/labels"
import type { KeyResult, MetricUnit, Objective } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface KeyResultDialogState {
  open: boolean
  key: number
  objective?: Pick<Objective, "id" | "title" | "starts_on" | "ends_on">
  keyResult?: KeyResult
}

const ALL = "all"
const AREAS: MetricArea[] = ["financial", "commercial", "operational"]

export function KeyResultDialog({
  state,
  metrics,
  onOpenChange,
}: {
  state: KeyResultDialogState
  metrics: MetricOption[]
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[6%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[560px]">
        <DialogTitle className="sr-only">{state.keyResult ? "Editar resultado-chave" : "Novo resultado-chave"}</DialogTitle>
        <DialogDescription className="sr-only">Como medir o objetivo: indicador do sistema ou valor manual, base e meta.</DialogDescription>
        {state.objective ? (
          <KeyResultForm key={state.key} objective={state.objective} keyResult={state.keyResult} metrics={metrics} onDone={() => onOpenChange(false)} />
        ) : null}
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

function KeyResultForm({
  objective,
  keyResult,
  metrics,
  onDone,
}: {
  objective: Pick<Objective, "id" | "title" | "starts_on" | "ends_on">
  keyResult?: KeyResult
  metrics: MetricOption[]
  onDone: () => void
}) {
  const ids = useId()
  const { clients } = useWorkspace()
  const [mode, setMode] = useState<"auto" | "manual">(keyResult && !keyResult.metric ? "manual" : "auto")
  const [metricKey, setMetricKey] = useState<string | null>(keyResult?.metric ?? null)
  const metric = metricKey ? metrics.find((option) => option.key === metricKey) : undefined
  const [clientId, setClientId] = useState<string | null>(keyResult?.client_id ?? null)
  const [manualUnit, setManualUnit] = useState<MetricUnit>(keyResult && !keyResult.metric ? (keyResult.unit as MetricUnit) : "number")
  const unit: MetricUnit = mode === "auto" ? (metric?.unit ?? "number") : manualUnit
  const [title, setTitle] = useState(keyResult?.title ?? "")
  const [target, setTarget] = useState(keyResult ? valueToInput(keyResult.target_value, unit) : "")
  const [baseline, setBaseline] = useState(keyResult?.baseline_value !== null && keyResult ? valueToInput(keyResult.baseline_value, unit) : "")
  const [manual, setManual] = useState(keyResult?.manual_value !== null && keyResult ? valueToInput(keyResult.manual_value, unit) : "")
  const [preview, setPreview] = useState<{ key: string; data: KeyResultPreview } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const previewKey = metric ? `${metric.key}:${metric.perClient ? (clientId ?? "") : ""}` : null
  const current = preview && preview.key === previewKey ? preview.data : null

  // Valor de hoje, base e sugestões do indicador escolhido (calculados no servidor).
  useEffect(() => {
    if (mode !== "auto" || !metric || !previewKey) return
    let active = true
    void previewKeyResult(metric.key, objective.starts_on, objective.ends_on, metric.perClient ? clientId : null).then((result) => {
      if (active && result.ok) setPreview({ key: previewKey, data: result.data })
    })
    return () => {
      active = false
    }
  }, [mode, metric, previewKey, clientId, objective.starts_on, objective.ends_on])

  function submit() {
    const targetValue = inputToValue(target, unit)
    if (mode === "auto" && !metric) return setError("Escolha o indicador que mede este resultado.")
    if (targetValue === null) return setError("Informe a meta.")
    const baselineValue = baseline.trim() ? inputToValue(baseline, unit) : null
    if (baseline.trim() && baselineValue === null) return setError("Base inválida.")
    const manualValue = mode === "manual" && manual.trim() ? inputToValue(manual, unit) : null
    if (mode === "manual" && manual.trim() && manualValue === null) return setError("Valor atual inválido.")
    const name = title.trim() || (metric ? `${metric.label}: ${formatMetric(targetValue, unit)}` : "")
    if (!name) return setError("Descreva o resultado-chave.")
    setError(null)
    const fields = {
      title: name,
      metric: mode === "auto" ? metric!.key : null,
      client_id: mode === "auto" && metric?.perClient ? clientId : null,
      unit,
      target_value: targetValue,
      baseline_value: baselineValue,
      manual_value: manualValue,
    }
    startTransition(async () => {
      const result = keyResult ? await updateKeyResult(keyResult.id, fields) : await createKeyResult({ objective_id: objective.id, ...fields })
      if (!result.ok) return setError(result.error)
      toast.success(keyResult ? "Resultado-chave salvo" : "Resultado-chave criado", { description: name })
      onDone()
    })
  }

  function remove() {
    if (!keyResult) return
    startTransition(async () => {
      const result = await deleteKeyResult(keyResult.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Resultado-chave excluído", { description: keyResult.title })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[90svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="truncate text-xs font-medium text-muted-foreground">{objective.title}</p>
        <input
          autoFocus={!keyResult}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Ex.: MRR de R$ 5.000 (ou deixe em branco)"
          aria-label="Resultado-chave"
          className="mt-1 w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />

        <div role="radiogroup" aria-label="Como medir" className="mt-4 inline-flex rounded-lg bg-muted p-0.5">
          {(["auto", "manual"] as const).map((option) => (
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
              {option === "auto" ? "Indicador do sistema" : "Valor manual"}
            </button>
          ))}
        </div>

        {mode === "auto" ? (
          <div className="mt-3 space-y-3">
            <Field label="Indicador">
              <Select value={metricKey ?? ""} onValueChange={(value) => setMetricKey(value)}>
                <SelectTrigger aria-label="Indicador" className="h-9 w-full shadow-none">
                  <SelectValue placeholder="Escolha o que mede o resultado" />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="max-h-80">
                  {AREAS.map((area) => (
                    <SelectGroup key={area}>
                      <SelectLabel>{METRIC_AREA_LABEL[area]}</SelectLabel>
                      {metrics
                        .filter((option) => option.area === area)
                        .map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {metric ? <p className="text-xs text-muted-foreground">{metric.formula}</p> : null}
            </Field>
            {metric?.perClient ? (
              <Field label="De qual cliente">
                <Select value={clientId ?? ALL} onValueChange={(value) => setClientId(value === ALL ? null : value)}>
                  <SelectTrigger aria-label="Cliente" className="h-9 w-full shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value={ALL}>Todos (a Boop inteira)</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {metric ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-[13px]">
                {current ? (
                  <>
                    <p className="text-foreground">
                      Hoje: <strong className="font-semibold tabular-nums">{formatMetric(current.current, metric.unit, true)}</strong>
                      <span className="text-muted-foreground"> no período · base {formatMetric(current.baseline, metric.unit, true)}</span>
                    </p>
                    {current.suggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {current.suggestions.map((suggestion) => (
                          <button
                            key={suggestion.label}
                            type="button"
                            title={suggestion.hint}
                            onClick={() => setTarget(valueToInput(suggestion.value, metric.unit))}
                            className="h-7 rounded-full border bg-background px-2.5 text-xs text-foreground transition-colors hover:border-foreground/40"
                          >
                            {suggestion.label}: <span className="tabular-nums">{formatMetric(suggestion.value, metric.unit)}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Sem histórico suficiente para sugerir uma meta.</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Calculando o valor de hoje…</p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Unidade">
              <Select value={manualUnit} onValueChange={(value) => setManualUnit(value as MetricUnit)}>
                <SelectTrigger aria-label="Unidade" className="h-9 w-full shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {METRIC_UNITS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {METRIC_UNIT_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Valor atual ${UNIT_SUFFIX[unit] ? `(${UNIT_SUFFIX[unit]})` : ""}`} htmlFor={`${ids}-manual`}>
              <Input id={`${ids}-manual`} inputMode="decimal" value={manual} onChange={(event) => setManual(event.target.value)} className="h-9 text-right tabular-nums" />
            </Field>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={`Meta ${UNIT_SUFFIX[unit] ? `(${UNIT_SUFFIX[unit]})` : ""}`} htmlFor={`${ids}-target`}>
            <Input id={`${ids}-target`} inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} className="h-9 text-right tabular-nums" />
          </Field>
          <Field label="Base (opcional)" htmlFor={`${ids}-baseline`}>
            <Input
              id={`${ids}-baseline`}
              inputMode="decimal"
              value={baseline}
              onChange={(event) => setBaseline(event.target.value)}
              placeholder={current ? valueToInput(current.baseline, unit) : "0"}
              className="h-9 text-right tabular-nums"
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Progresso = (atual − base) ÷ (meta − base). Em branco, a base é zero (somas no período) ou o valor no começo do
          período (MRR, saldo, percentuais).
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          {keyResult ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir resultado-chave"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : keyResult ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este resultado-chave?</AlertDialogTitle>
            <AlertDialogDescription>“{keyResult?.title}” sai do objetivo.</AlertDialogDescription>
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
