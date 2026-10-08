import {
  BookOpen,
  ChartColumn,
  ListChecks,
  MessageSquareQuote,
  Palette,
  Scale,
  Smartphone,
  Target,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { needsReview } from "@/features/docs/logic"
import type { TemplateId } from "@/features/docs/templates"
import { daysBetween, formatShortDate, toDateKey } from "@/lib/dates"
import { DOC_STATUS_LABEL } from "@/lib/labels"
import { findMatches } from "@/lib/text"
import type { DateKey, DocKind, DocSummary, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

export const DOC_KIND_ICON: Record<DocKind, LucideIcon> = {
  process: Workflow,
  checklist: ListChecks,
  policy: Scale,
  guide: BookOpen,
}

/** Ícones dos modelos do cliente (os outros modelos usam o ícone do tipo). */
export const CLIENT_TEMPLATE_ICON: Partial<Record<TemplateId, LucideIcon>> = {
  persona: UserRound,
  verbal_identity: MessageSquareQuote,
  visual_identity: Palette,
  monthly_strategy: Target,
  stories_plan: Smartphone,
  monthly_report: ChartColumn,
}

/** Ícone do tipo de documento, num quadradinho. */
export function DocKindTile({ kind, className }: { kind: DocKind; className?: string }) {
  const Icon = DOC_KIND_ICON[kind]
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-content-center rounded-lg border bg-background text-muted-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

type EffectiveStatus = "draft" | "active" | "review"

/** Status que a pessoa vê: "Em vigor" com a revisão vencida conta como "Revisar". */
export function effectiveStatus(
  doc: Pick<DocSummary, "status" | "next_review_on">,
  today: DateKey
): EffectiveStatus {
  return needsReview(doc, today) ? "review" : doc.status
}

const STATUS_STYLE: Record<EffectiveStatus, string> = {
  draft: "border-dashed border-border text-muted-foreground",
  active: "border-success/25 bg-success/10 text-[oklch(0.42_0.1_158)]",
  review: "border-amber-600/20 bg-amber-50 text-amber-800",
}

export function DocStatusBadge({
  doc,
  today,
  className,
}: {
  doc: Pick<DocSummary, "status" | "next_review_on">
  today: DateKey
  className?: string
}) {
  const status = effectiveStatus(doc, today)
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11.5px] leading-none font-medium whitespace-nowrap",
        STATUS_STYLE[status],
        className
      )}
    >
      {DOC_STATUS_LABEL[status]}
    </span>
  )
}

/** "hoje", "ontem", "há 3 dias" ou "em 12/09". */
export function sinceLabel(at: Timestamp, today: DateKey): string {
  const day = toDateKey(at)
  const diff = daysBetween(day, today)
  if (diff <= 0) return "hoje"
  if (diff === 1) return "ontem"
  if (diff < 7) return `há ${diff} dias`
  return `em ${formatShortDate(day, today)}`
}

export type ReviewTone = "overdue" | "soon" | "ok" | "none"

/** Situação da revisão periódica, em linguagem natural. */
export function reviewInfo(
  doc: Pick<DocSummary, "review_every_months" | "next_review_on">,
  today: DateKey
): { label: string; tone: ReviewTone } {
  if (!doc.review_every_months || !doc.next_review_on) {
    return { label: "Sem revisão periódica", tone: "none" }
  }
  const date = formatShortDate(doc.next_review_on, today)
  const diff = daysBetween(today, doc.next_review_on)
  if (diff < 0) return { label: `Revisão venceu em ${date}`, tone: "overdue" }
  if (diff === 0) return { label: "Revisar hoje", tone: "overdue" }
  if (diff <= 30) return { label: `Revisar até ${date}`, tone: "soon" }
  return { label: `Próxima revisão em ${date}`, tone: "ok" }
}

/** Texto com os trechos que batem com a busca destacados. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const matches = findMatches(text, query, 20)
  if (matches.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!
    const from = index === 0 ? 0 : matches[index - 1]!.end
    if (match.start > from) parts.push(text.slice(from, match.start))
    parts.push(
      <mark key={index} className="rounded-[3px] bg-brand-sky/60 px-0.5 text-foreground">
        {text.slice(match.start, match.end)}
      </mark>
    )
  }
  parts.push(text.slice(matches[matches.length - 1]!.end))
  return <>{parts}</>
}
