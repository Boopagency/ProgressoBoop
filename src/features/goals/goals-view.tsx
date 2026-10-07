"use client"

import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Pencil, Plus, Target } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { createStarterGoal } from "@/features/goals/actions"
import { KeyResultDialog, type KeyResultDialogState } from "@/features/goals/key-result-dialog"
import { GOAL_STATE_LABEL, type GoalState, type ObjectiveFilter } from "@/features/goals/logic"
import { ObjectiveDialog, type ObjectiveDialogState } from "@/features/goals/objective-dialog"
import type { KeyResultView, MetricOption, ObjectiveView } from "@/features/goals/view-model"
import { formatMetric } from "@/features/metrics/format"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { formatShortDate } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import { TASK_AREA_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATE_STYLE: Record<GoalState, { className: string; icon: typeof CheckCircle2 }> = {
  upcoming: { className: "text-muted-foreground", icon: Clock },
  on_track: { className: "text-success-ink", icon: CheckCircle2 },
  at_risk: { className: "text-warning-ink", icon: AlertTriangle },
  behind: { className: "text-overdue", icon: AlertTriangle },
  achieved: { className: "text-success-ink", icon: CheckCircle2 },
  ended: { className: "text-muted-foreground", icon: Clock },
  missed: { className: "text-overdue", icon: AlertTriangle },
}

/** Situação com ícone e texto (a cor nunca vem sozinha). */
function StateLabel({ state, className }: { state: GoalState; className?: string }) {
  const { className: tone, icon: Icon } = STATE_STYLE[state]
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {GOAL_STATE_LABEL[state]}
    </span>
  )
}

/** Barra de progresso com a marca do esperado para hoje. */
function GoalMeter({ progress, expected, label, className }: { progress: number | null; expected: number; label: string; className?: string }) {
  const value = progress === null ? 0 : Math.max(0, Math.min(1, progress))
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn("relative block h-1.5 rounded-full bg-muted", className)}
    >
      <span className="block h-full rounded-full bg-brand" style={{ width: `${value * 100}%` }} />
      {expected > 0 && expected < 1 ? (
        <span
          aria-hidden="true"
          title={`Esperado para hoje: ${formatPercent(expected, true)}`}
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/50"
          style={{ left: `${expected * 100}%` }}
        />
      ) : null}
    </span>
  )
}

/** Tela Metas: objetivos com resultados-chave que se atualizam pelos dados do sistema. */
export function GoalsView({ goals, metrics, today }: { goals: ObjectiveView[]; metrics: MetricOption[]; today: DateKey }) {
  const [filter, setFilter] = useState<ObjectiveFilter>("current")
  const [objectiveDialog, setObjectiveDialog] = useState<ObjectiveDialogState>({ open: false, key: 0 })
  const [keyResultDialog, setKeyResultDialog] = useState<KeyResultDialogState>({ open: false, key: 0 })
  const [isPending, startTransition] = useTransition()
  useUrlTrigger(() => setObjectiveDialog((state) => ({ open: true, key: state.key + 1 })))
  const counts = {
    current: goals.filter((goal) => goal.timing === "current").length,
    upcoming: goals.filter((goal) => goal.timing === "upcoming").length,
    past: goals.filter((goal) => goal.timing === "past").length,
  }
  const visible = goals.filter((goal) => filter === "all" || goal.timing === filter)

  function newObjective() {
    setObjectiveDialog((state) => ({ open: true, key: state.key + 1 }))
  }

  function starter() {
    startTransition(async () => {
      const result = await createStarterGoal()
      if (!result.ok) toast.error(result.error)
      else toast.success("Meta criada", { description: "MRR de R$ 5.000 neste trimestre, medido pelos contratos." })
    })
  }

  return (
    <PageContainer className="max-w-[1100px]">
      <PageHeader
        title="Metas"
        description="Objetivos e resultados-chave que acompanham os números do sistema sozinhos"
        actions={
          <Button onClick={newObjective} className="gap-1.5">
            <Plus />
            Novo objetivo
          </Button>
        }
      />

      {goals.length > 0 ? (
        <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <SegmentedControl
            aria-label="Período das metas"
            value={filter}
            onValueChange={setFilter}
            className="w-max"
            options={[
              { value: "current", label: `Em andamento (${counts.current})` },
              { value: "upcoming", label: `Próximas (${counts.upcoming})` },
              { value: "past", label: `Encerradas (${counts.past})` },
              { value: "all", label: "Todas" },
            ]}
          />
        </div>
      ) : null}

      {goals.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Target className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-semibold">Defina o que a Boop quer alcançar</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Um objetivo tem período e resultados-chave. Ligue cada resultado a um indicador (MRR, faturamento, leads,
            entregas no prazo…) e o progresso se atualiza com os dados, sem planilha paralela.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={starter} disabled={isPending}>
              Começar pela meta de MRR da planilha
            </Button>
            <Button size="sm" variant="outline" onClick={newObjective}>
              Criar do zero
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-center text-[13px] text-muted-foreground">Nenhum objetivo neste filtro.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {visible.map((goal) => (
            <ObjectiveCard
              key={goal.objective.id}
              goal={goal}
              today={today}
              onEdit={() => setObjectiveDialog((state) => ({ open: true, key: state.key + 1, objective: goal.objective }))}
              onAddKeyResult={() => setKeyResultDialog((state) => ({ open: true, key: state.key + 1, objective: goal.objective }))}
              onEditKeyResult={(row) =>
                setKeyResultDialog((state) => ({ open: true, key: state.key + 1, objective: goal.objective, keyResult: row.keyResult }))
              }
            />
          ))}
        </div>
      )}

      <ObjectiveDialog
        state={objectiveDialog}
        onOpenChange={(open) => setObjectiveDialog((state) => ({ ...state, open }))}
        onCreated={(objective) => setKeyResultDialog((state) => ({ open: true, key: state.key + 1, objective }))}
      />
      <KeyResultDialog state={keyResultDialog} metrics={metrics} onOpenChange={(open) => setKeyResultDialog((state) => ({ ...state, open }))} />
    </PageContainer>
  )
}

function ObjectiveCard({
  goal,
  today,
  onEdit,
  onAddKeyResult,
  onEditKeyResult,
}: {
  goal: ObjectiveView
  today: DateKey
  onEdit: () => void
  onAddKeyResult: () => void
  onEditKeyResult: (row: KeyResultView) => void
}) {
  const { profileById } = useWorkspace()
  const { objective } = goal
  const owner = objective.owner_id ? profileById.get(objective.owner_id) : undefined
  return (
    <section aria-labelledby={`objetivo-${objective.id}`} className="overflow-hidden rounded-xl border bg-card">
      <header className="px-4 pt-4 pb-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`objetivo-${objective.id}`} className="text-[15px] font-semibold text-foreground">
              {objective.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatShortDate(objective.starts_on, today)} a {formatShortDate(objective.ends_on, today)}
              {owner ? ` · ${firstName(owner.full_name)}` : " · equipe"}
              {objective.area ? ` · ${TASK_AREA_LABEL[objective.area]}` : ""}
            </p>
          </div>
          <StateLabel state={goal.state} className="mt-0.5" />
          <Button variant="ghost" size="icon-sm" aria-label="Editar objetivo" onClick={onEdit} className="-mt-1 -mr-2 text-muted-foreground">
            <Pencil className="size-3.5" />
          </Button>
        </div>
        {objective.description ? <p className="mt-2 text-[13px] text-muted-foreground">{objective.description}</p> : null}
        <div className="mt-3 flex items-center gap-3">
          <GoalMeter progress={goal.progress} expected={goal.expected} label={`Progresso de ${objective.title}`} className="flex-1" />
          <span className="w-12 shrink-0 text-right text-[13px] font-semibold text-foreground tabular-nums">
            {goal.progress === null ? "—" : formatPercent(Math.max(0, goal.progress), true)}
          </span>
        </div>
        {goal.timing === "current" ? (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {formatPercent(goal.expected, true)} do período já passou (a marca na barra)
          </p>
        ) : null}
      </header>
      <ul className="divide-y border-t">
        {goal.keyResults.map((row) => (
          <KeyResultRow key={row.keyResult.id} row={row} onEdit={() => onEditKeyResult(row)} />
        ))}
      </ul>
      <div className="border-t px-2 py-1.5">
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={onAddKeyResult}>
          <Plus className="size-3.5" />
          Resultado-chave
        </Button>
      </div>
    </section>
  )
}

function KeyResultRow({ row, onEdit }: { row: KeyResultView; onEdit: () => void }) {
  const { clientById } = useWorkspace()
  const client = row.keyResult.client_id ? clientById.get(row.keyResult.client_id) : undefined
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEdit} className="text-left text-[13.5px] font-medium text-foreground hover:underline">
            {row.keyResult.title}
          </button>
          <p className="text-xs text-muted-foreground">
            {row.metricLabel ? (
              <>
                {row.href ? (
                  <Link href={row.href} className="inline-flex items-center gap-0.5 hover:text-foreground">
                    {row.metricLabel}
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                ) : (
                  row.metricLabel
                )}
                {client ? ` · ${client.name}` : ""}
                {" · automático"}
              </>
            ) : (
              <>
                manual ·{" "}
                <button type="button" onClick={onEdit} className="font-medium text-foreground hover:underline">
                  atualizar o valor
                </button>
              </>
            )}
          </p>
        </div>
        <StateLabel state={row.state} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <GoalMeter progress={row.progress} expected={row.expected} label={`Progresso de ${row.keyResult.title}`} className="flex-1" />
        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{formatMetric(row.current, row.unit)}</span> de {formatMetric(row.target, row.unit)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        {row.progress === null ? "Sem valor ainda" : `${formatPercent(Math.max(0, row.progress), true)} do caminho`}
        {row.baseline !== 0 ? ` · base ${formatMetric(row.baseline, row.unit)}` : ""}
        {row.projected !== null ? ` · previsão no fim: ${formatMetric(row.projected, row.unit)}` : ""}
      </p>
    </li>
  )
}
