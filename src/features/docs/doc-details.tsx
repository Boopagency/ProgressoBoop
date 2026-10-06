"use client"

import { CalendarCheck, ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { effectiveStatus, reviewInfo } from "@/features/docs/doc-meta"
import type { DocPatch } from "@/features/docs/validation"
import { OwnerPicker } from "@/features/meetings/owner-picker"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import {
  DOC_KIND_LABEL,
  DOC_KINDS,
  DOC_STATUS_LABEL,
  DOC_STATUSES,
  TASK_AREA_LABEL,
  TASK_AREAS,
  isDocKind,
  isDocStatus,
  isTaskArea,
} from "@/lib/labels"
import type { DateKey, Doc } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "none"
const REVIEW_OPTIONS = [1, 3, 6, 12] as const
const TRIGGER =
  "h-8 w-full min-w-0 justify-between border-transparent bg-transparent px-2 text-[13px] shadow-none hover:bg-accent data-[state=open]:bg-accent [&>svg:last-child]:opacity-40"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/**
 * Propriedades do documento. No celular começa fechado (uma linha de resumo)
 * para o texto aparecer logo; em telas grandes fica sempre aberto, na lateral.
 */
export function DocDetails({
  doc,
  today,
  onChange,
  onMarkReviewed,
}: {
  doc: Doc
  today: DateKey
  onChange: (patch: DocPatch) => void
  onMarkReviewed: () => void
}) {
  const { clients, profileById } = useWorkspace()
  const [open, setOpen] = useState(false)
  const status = effectiveStatus(doc, today)
  const review = reviewInfo(doc, today)
  const owner = doc.owner_id ? profileById.get(doc.owner_id) : undefined
  const client = doc.client_id ? clients.find((candidate) => candidate.id === doc.client_id) : undefined

  const collapsedSummary = [
    DOC_STATUS_LABEL[status],
    doc.area ? TASK_AREA_LABEL[doc.area] : null,
    client?.name ?? null,
    owner ? firstName(owner.full_name) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <section aria-labelledby="detalhes-titulo" className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 xl:pointer-events-none xl:pb-1"
      >
        <h2 id="detalhes-titulo" className="text-sm font-semibold text-foreground">
          Detalhes
        </h2>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground xl:hidden">
          {open ? null : collapsedSummary}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform xl:hidden", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <div className={cn("px-2 pb-3 xl:block", open ? "block" : "hidden")}>
        <dl className="space-y-0.5 px-2">
          <Row label="Tipo">
            <Select value={doc.kind} onValueChange={(value) => isDocKind(value) && onChange({ kind: value })}>
              <SelectTrigger size="sm" aria-label="Tipo" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {DOC_KINDS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {DOC_KIND_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Status">
            <Select value={doc.status} onValueChange={(value) => isDocStatus(value) && onChange({ status: value })}>
              <SelectTrigger size="sm" aria-label="Status" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {DOC_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {DOC_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Área">
            <Select
              value={doc.area ?? NONE}
              onValueChange={(value) => onChange({ area: isTaskArea(value) ? value : null })}
            >
              <SelectTrigger size="sm" aria-label="Área" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Sem área
                </SelectItem>
                {TASK_AREAS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TASK_AREA_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Cliente">
            <Select
              value={doc.client_id ?? NONE}
              onValueChange={(value) => onChange({ client_id: value === NONE ? null : value })}
            >
              <SelectTrigger size="sm" aria-label="Cliente" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Nenhum
                </SelectItem>
                {clients
                  .filter((candidate) => candidate.active || candidate.id === doc.client_id)
                  .map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Responsável">
            <OwnerPicker
              value={doc.owner_id}
              onChange={(ownerId) => onChange({ owner_id: ownerId })}
              className="h-8 w-full px-2"
            />
          </Row>
          <Row label="Revisão">
            <Select
              value={doc.review_every_months ? String(doc.review_every_months) : NONE}
              onValueChange={(value) =>
                onChange({ review_every_months: value === NONE ? null : Number(value) })
              }
            >
              <SelectTrigger size="sm" aria-label="Revisão periódica" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Sem revisão periódica
                </SelectItem>
                {REVIEW_OPTIONS.map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {months === 1 ? "Todo mês" : months === 12 ? "Uma vez por ano" : `A cada ${months} meses`}
                  </SelectItem>
                ))}
                {doc.review_every_months && !(REVIEW_OPTIONS as readonly number[]).includes(doc.review_every_months) ? (
                  <SelectItem value={String(doc.review_every_months)}>
                    A cada {doc.review_every_months} meses
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Row>
        </dl>

        <div className="mx-2 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <p
            className={cn(
              "text-xs",
              review.tone === "overdue" ? "font-medium text-amber-800" : "text-muted-foreground"
            )}
          >
            {review.label}
            {doc.reviewed_on ? (
              <span className="block font-normal text-muted-foreground">
                Última revisão em {formatShortDate(doc.reviewed_on, today)}
              </span>
            ) : null}
          </p>
          {doc.reviewed_on !== today ? (
            <Button variant="outline" size="sm" onClick={onMarkReviewed} className="h-7 gap-1.5 bg-background px-2.5 text-xs shadow-none">
              <CalendarCheck className="size-3.5" />
              Revisado hoje
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
