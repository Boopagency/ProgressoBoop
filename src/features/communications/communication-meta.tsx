import { Mail, MessageCircle, MoreHorizontal, Phone, Users } from "lucide-react"

import { COMMUNICATION_CHANNEL_LABEL, COMMUNICATION_KIND_LABEL } from "@/lib/labels"
import type { CommunicationChannel, CommunicationKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_STYLE: Record<CommunicationKind, string> = {
  request: "border-amber-600/15 bg-amber-50 text-amber-800",
  approval: "border-success/20 bg-success/10 text-success",
  feedback: "border-brand/25 bg-brand-soft/60 text-brand-ink",
  update: "border-border bg-background text-muted-foreground",
  other: "border-border bg-background text-muted-foreground",
}

/** Pedido (laranja), Aprovação (verde), Feedback (marca), Atualização e Outro (neutros). */
export function CommunicationKindBadge({ kind, className }: { kind: CommunicationKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        KIND_STYLE[kind],
        className
      )}
    >
      {COMMUNICATION_KIND_LABEL[kind]}
    </span>
  )
}

const CHANNEL_ICON: Record<CommunicationChannel, typeof Mail> = {
  whatsapp: MessageCircle,
  email: Mail,
  call: Phone,
  meeting: Users,
  other: MoreHorizontal,
}

export function ChannelIcon({ channel, className }: { channel: CommunicationChannel; className?: string }) {
  const Icon = CHANNEL_ICON[channel]
  return (
    <span title={COMMUNICATION_CHANNEL_LABEL[channel]} className={cn("inline-flex", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{COMMUNICATION_CHANNEL_LABEL[channel]}</span>
    </span>
  )
}
