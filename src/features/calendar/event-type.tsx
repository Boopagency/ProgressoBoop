import { EVENT_TYPE_LABEL } from "@/lib/labels"
import type { EventType } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Cores discretas por tipo de item no calendário. */
export const EVENT_TYPE_STYLE: Record<EventType, { dot: string; block: string }> = {
  meeting: {
    dot: "bg-violet-500",
    block: "border-violet-500/70 bg-violet-50 text-violet-950 hover:bg-violet-100/80",
  },
  internal: {
    dot: "bg-sky-500",
    block: "border-sky-500/70 bg-sky-50 text-sky-950 hover:bg-sky-100/80",
  },
  delivery: {
    dot: "bg-orange-500",
    block: "border-orange-500/70 bg-orange-50 text-orange-950 hover:bg-orange-100/80",
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
