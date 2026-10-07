import { CheckCircle2 } from "lucide-react"

import type { ReviewState, ReviewStatus } from "@/features/clients/logic"
import { monthName } from "@/features/clients/logic"
import { formatShortDate } from "@/lib/dates"
import { CLIENT_HEALTH_LABEL } from "@/lib/labels"
import type { ClientHealth, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Semáforo e situação da revisão. Verde, laranja e vermelho são as cores de
 * concluído, atenção e atrasado do produto; "sem avaliação" fica em cinza.
 */

const HEALTH_DOT: Record<ClientHealth | "none", string> = {
  healthy: "bg-success",
  attention: "bg-warning",
  at_risk: "bg-overdue",
  none: "border border-dashed border-muted-foreground/50 bg-transparent",
}

export function HealthDot({ health, className }: { health: ClientHealth | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", HEALTH_DOT[health ?? "none"], className)}
    />
  )
}

const HEALTH_BADGE: Record<ClientHealth | "none", string> = {
  healthy: "border-success/25 bg-success/10 text-[oklch(0.42_0.1_158)]",
  attention: "border-amber-600/20 bg-amber-50 text-amber-800",
  at_risk: "border-overdue/25 bg-overdue/10 text-overdue",
  none: "border-dashed border-border text-muted-foreground",
}

/** "Saudável", "Atenção", "Em risco" ou "Sem avaliação". */
export function HealthBadge({ health, className }: { health: ClientHealth | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11.5px] leading-none font-medium whitespace-nowrap",
        HEALTH_BADGE[health ?? "none"],
        className
      )}
    >
      <HealthDot health={health} className="size-1.5" />
      {health ? CLIENT_HEALTH_LABEL[health] : "Sem avaliação"}
    </span>
  )
}

/** Texto da situação da revisão do mês: "Feita", "Até 10/10", "Atrasada desde 10/10"… */
export function reviewStateLabel(status: ReviewStatus, today: DateKey): string {
  const due = status.due ? formatShortDate(status.due, today) : null
  switch (status.state) {
    case "done":
      return "Feita"
    case "overdue":
      return due ? `Atrasada (venceu ${due})` : "Atrasada"
    case "in_progress":
      return due ? `Em andamento · até ${due}` : "Em andamento"
    case "pending":
      return due ? `Até ${due}` : "Pendente"
    default:
      return "Sem revisão mensal"
  }
}

const STATE_STYLE: Record<ReviewState, string> = {
  done: "text-[oklch(0.42_0.1_158)]",
  overdue: "font-medium text-overdue",
  in_progress: "text-foreground",
  pending: "text-muted-foreground",
  off: "text-subtle-foreground",
}

/** "Revisão de outubro: Atrasada (venceu 10/10)". */
export function ReviewStateText({
  status,
  today,
  withMonth = true,
  className,
}: {
  status: ReviewStatus
  today: DateKey
  withMonth?: boolean
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", STATE_STYLE[status.state], className)}>
      {status.state === "done" ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
      {withMonth && status.state !== "off" ? `Revisão de ${monthName(status.period)}: ` : null}
      {reviewStateLabel(status, today)}
    </span>
  )
}
