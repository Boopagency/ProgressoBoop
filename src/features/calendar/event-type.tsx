import { EVENT_TYPE_LABEL } from "@/lib/labels"
import type { EventType } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Cores discretas por tipo de item no calendário, da paleta da marca:
 * reunião em ciano, interno em azul-marinho claro. Entrega fica em laranja
 * (prazo = atenção).
 */
export const EVENT_TYPE_STYLE: Record<EventType, { dot: string; block: string }> = {
  meeting: {
    dot: "bg-brand",
    block: "border-brand bg-brand-soft text-tint-foreground hover:bg-brand-sky/60",
  },
  internal: {
    dot: "bg-brand-slate",
    block: "border-brand-slate/70 bg-brand-mist/60 text-tint-foreground hover:bg-brand-mist",
  },
  delivery: {
    dot: "bg-priority",
    block: "border-priority/70 bg-priority/10 text-foreground hover:bg-priority/15",
  },
}

export function EventTypeDot({ type, className }: { type: EventType; className?: string }) {
  return (
    <span
      role="img"
      aria-label={EVENT_TYPE_LABEL[type]}
      className={cn("inline-block size-2 shrink-0 rounded-full", EVENT_TYPE_STYLE[type].dot, className)}
    />
  )
}
