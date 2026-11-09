"use client"

import { Check, CircleDashed, Clock, Hourglass, MinusCircle, RotateCcw, Zap } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { markStep } from "@/features/journey/actions"
import {
  JOURNEY_ACTOR_LABEL,
  JOURNEY_LINE_SHORT,
  JOURNEY_PHASE_LABEL,
  JOURNEY_PHASES,
  type JourneyActor,
  type JourneyLine,
  type JourneyPhase,
} from "@/features/journey/catalog"
import { canSkip, daysLabel, lateLabel, type JourneyStatus, type StepStatus } from "@/features/journey/logic"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatDayMonth } from "@/lib/dates"
import { cn } from "@/lib/utils"

/* Peças da jornada usadas na tela Jornada e na barra da ficha do cliente. */

/** A linha de serviço em pílula de contorno. */
export function LineBadge({ line, className }: { line: JourneyLine; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border border-foreground/20 px-2 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase",
        className
      )}
    >
      {JOURNEY_LINE_SHORT[line]}
    </span>
  )
}

/** Quem age: a Boop (azul) ou o cliente (neutro, com a ampulheta). */
export function ActorPill({ actor, className }: { actor: JourneyActor; className?: string }) {
  const Icon = actor === "boop" ? Zap : Hourglass
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
        actor === "boop" ? "bg-brand-soft text-brand-ink" : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {actor === "boop" ? "Com a Boop" : "Com o cliente"}
    </span>
  )
}

/** Há quantos dias está na etapa e o atraso em destaque. */
export function StepClock({ status, className }: { status: JourneyStatus; className?: string }) {
  if (!status.current) return null
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs tabular-nums", className)}>
      {status.late ? (
        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-overdue/12 px-2 font-medium whitespace-nowrap text-overdue">
          <Clock className="size-3" aria-hidden="true" />
          {lateLabel(status.late_days)}
        </span>
      ) : (
        <span className="whitespace-nowrap text-muted-foreground">até {formatDayMonth(status.current.due)}</span>
      )}
      <span className="whitespace-nowrap text-subtle-foreground">· {daysLabel(status.days_in_step)}</span>
    </span>
  )
}

/** As fases em trilha: as que passaram cheias, a atual com brilho. Saída só aparece se a jornada chegou nela. */
export function PhaseTrack({ phase, className }: { phase: JourneyPhase; className?: string }) {
  const phases = JOURNEY_PHASES.filter((candidate) => candidate !== "offboarding" || phase === "offboarding")
  const currentIndex = phases.indexOf(phase)
  return (
    <ol aria-label="Fases da jornada" className={cn("flex items-center gap-1", className)}>
      {phases.map((candidate, index) => (
        <li key={candidate} className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            aria-hidden="true"
            className={cn(
              "h-1 rounded-full",
              index < currentIndex && "bg-brand",
              index === currentIndex && "bg-glow shadow-[0_0_10px_var(--glow)]",
              index > currentIndex && "bg-foreground/10"
            )}
          />
          <span
            className={cn(
              "truncate text-[10.5px] tracking-[0.06em] uppercase",
              index === currentIndex ? "font-semibold text-foreground" : "text-subtle-foreground max-sm:invisible"
            )}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            {JOURNEY_PHASE_LABEL[candidate]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Feita (à mão, com quem e quando, ou automática), "não se aplica" ou o prazo. */
export function StepMeta({ step }: { step: StepStatus }) {
  const { profileById } = useWorkspace()
  const who = step.by ? profileById.get(step.by) : null
  if (step.status === "done") {
    if (step.source === "auto") {
      return <span>Automático{step.at ? ` em ${formatDayMonth(step.at)}` : ""}</span>
    }
    return (
      <span>
        Feita{who ? ` por ${firstName(who.full_name)}` : ""}
        {step.at ? ` em ${formatDayMonth(step.at)}` : ""}
      </span>
    )
  }
  if (step.status === "not_applicable") {
    return <span>Não se aplica{who ? ` · ${firstName(who.full_name)}` : ""}</span>
  }
  return (
    <span className={step.late ? "font-medium text-overdue" : undefined}>
      {step.late ? `${lateLabel(step.late_days)} · era até ${formatDayMonth(step.due)}` : `Até ${formatDayMonth(step.due)}`}
      {" · "}
      {JOURNEY_ACTOR_LABEL[step.step.actor]}
      {step.reopened ? " · reaberta" : ""}
    </span>
  )
}

/** Uma etapa com as ações de marcar (um clique), para a barra da ficha. */
export function StepRow({
  journeyId,
  step,
  current,
  briefingHref,
}: {
  journeyId: string
  step: StepStatus
  current: boolean
  /** Etapas do briefing apontam para a aba dele. */
  briefingHref?: string
}) {
  const [isPending, startTransition] = useTransition()

  function mark(state: "done" | "not_applicable" | "open") {
    startTransition(async () => {
      const result = await markStep({ journey_id: journeyId, step_key: step.step.key, state })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data.advanced) toast.success(`Fase concluída: agora é ${JOURNEY_PHASE_LABEL[result.data.advanced]}`)
    })
  }

  const resolved = step.status !== "pending"
  const Icon = step.status === "done" ? Check : step.status === "not_applicable" ? MinusCircle : CircleDashed
  return (
    <li
      className={cn(
        "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3",
        current && "bg-brand-soft/40",
        isPending && "opacity-60"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
            step.status === "done" && "bg-success/15 text-success-ink",
            step.status === "not_applicable" && "text-subtle-foreground",
            step.status === "pending" && (step.late ? "text-overdue" : current ? "text-glow" : "text-subtle-foreground")
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[13.5px] leading-5 font-medium", resolved ? "text-muted-foreground" : "text-foreground")}>
            {step.step.name}
            {step.step.gate ? (
              <span className="ml-1.5 align-middle text-[10.5px] font-semibold tracking-[0.08em] text-brand-ink uppercase">Portão</span>
            ) : null}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            <StepMeta step={step} />
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-7 sm:pl-0">
        {briefingHref && !resolved ? (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <a href={briefingHref}>Abrir briefing</a>
          </Button>
        ) : null}
        {resolved ? (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={isPending} onClick={() => mark("open")}>
            <RotateCcw className="size-3.5" />
            Reabrir
          </Button>
        ) : (
          <>
            {canSkip(step.step) ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isPending} onClick={() => mark("not_applicable")}>
                Não se aplica
              </Button>
            ) : null}
            <Button
              variant={current ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs shadow-none"
              disabled={isPending}
              onClick={() => mark("done")}
            >
              <Check className="size-3.5" />
              Feita
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
