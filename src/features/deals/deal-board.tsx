"use client"

import { CalendarDays, CalendarX2, Check, ChevronsLeft, History, Hourglass, PhoneOff, Tag, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanColumnHeader,
  KanbanEmpty,
  KanbanRail,
  useKanbanDrop,
} from "@/components/kanban"
import { ClientMark, clientColor, identityDotColor } from "@/features/content/post-meta"
import {
  BOARD_CLOSED_DAYS,
  boardColumns,
  dealAlerts,
  idleDays,
  isCollapsibleStage,
  isOpenDeal,
  probabilityOf,
  type DealAlert,
  type DealAlertKind,
} from "@/features/deals/logic"
import { formatMoneyShort } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import { DEAL_STAGE_LABEL, DEAL_STAGES, LEAD_SOURCE_LABEL, LEAD_SOURCES } from "@/lib/labels"
import { includesText } from "@/lib/text"
import type { DateKey, Deal, DealStage, LeadSource } from "@/lib/types"
import { cn } from "@/lib/utils"

const DRAG_TYPE = "application/x-boop-deal"

/**
 * Ponto de cada etapa: o azul vai enchendo conforme o negócio avança no funil;
 * ganho é verde (concluído) e perdido, neutro.
 */
const STAGE_DOT: Record<DealStage, string> = {
  lead: "border-2 border-glow/70",
  contact: "bg-glow/45",
  proposal: "bg-glow/75",
  negotiation: "bg-glow shadow-[0_0_8px_var(--glow)]",
  won: "bg-success shadow-[0_0_8px_var(--success)]",
  lost: "bg-muted-foreground/45",
}

export function StageDot({ stage, className }: { stage: DealStage; className?: string }) {
  return <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", STAGE_DOT[stage], className)} />
}

/** Ponto da origem do lead (cor só de identificação). */
export function SourceDot({ source, className }: { source: LeadSource; className?: string }) {
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", identityDotColor(LEAD_SOURCES.indexOf(source)), className)} />
}

export const ALERT_LABEL: Record<DealAlertKind, string> = {
  late: "Atrasado",
  no_contact: "Sem contato",
  stale: "Parado",
}

const ALERT_ICON: Record<DealAlertKind, LucideIcon> = {
  late: CalendarX2,
  no_contact: PhoneOff,
  stale: Hourglass,
}

const ALERT_HINT: Record<DealAlertKind, (days: number) => string> = {
  late: (days) => `A previsão de fechamento passou há ${days} ${days === 1 ? "dia" : "dias"}`,
  no_contact: (days) => `Na etapa Lead há ${days} dias, sem contato`,
  stale: (days) => `Sem nenhuma mudança há ${days} dias`,
}

const TAG_TONE = {
  brand: "bg-brand-soft text-brand-ink",
  neutral: "border border-foreground/12 text-muted-foreground",
  success: "bg-success/12 text-success-strong",
  overdue: "bg-overdue/10 text-overdue",
  attention: "bg-attention-muted text-attention-ink",
} as const

/** Etiqueta do cartão (serviço, chance, alertas). */
export function DealTag({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof TAG_TONE
  icon?: LucideIcon
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1 rounded-full px-2 text-[11px] leading-none font-medium whitespace-nowrap tabular-nums",
        TAG_TONE[tone]
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function AlertTag({ alert }: { alert: DealAlert }) {
  return (
    <DealTag tone={alert.kind === "stale" ? "attention" : "overdue"} icon={ALERT_ICON[alert.kind]} title={ALERT_HINT[alert.kind](alert.days)}>
      {ALERT_LABEL[alert.kind]} · {alert.days} d
    </DealTag>
  )
}

/**
 * Quadro do funil: pré-venda (Lead e Em contato) e saída (Perdido) podem
 * ficar recolhidas numa faixa; propostas, negociações e ganhos ficam sempre
 * abertos. Arrastar muda a etapa (também para uma faixa recolhida); soltar
 * em Ganho abre a conversão.
 */
export function DealBoard({
  deals,
  today,
  collapsed,
  onToggle,
  onOpen,
  onMove,
  className,
}: {
  deals: Deal[]
  today: DateKey
  /** Etapas recolhidas (só pré-venda e saída). */
  collapsed: readonly DealStage[]
  onToggle: (stage: DealStage) => void
  onOpen: (deal: Deal) => void
  onMove: (id: string, stage: DealStage) => void
  className?: string
}) {
  const { over, dropTarget } = useKanbanDrop<DealStage>(DRAG_TYPE, onMove)
  const columns = boardColumns(deals, today)

  return (
    <KanbanBoard className={className}>
      {DEAL_STAGES.map((stage, index) => {
        const items = columns[stage]
        const closed = stage === "won" || stage === "lost"
        if (collapsed.includes(stage) && isCollapsibleStage(stage)) {
          const flagged = items.filter((deal) => dealAlerts(deal, today).length > 0).length
          return (
            <KanbanRail
              key={stage}
              index={index}
              label={DEAL_STAGE_LABEL[stage]}
              dot={<StageDot stage={stage} />}
              count={items.length}
              badge={
                flagged > 0 ? (
                  <span
                    title={`${flagged} ${flagged === 1 ? "pede" : "pedem"} atenção`}
                    className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-overdue/10 px-1.5 text-[11px] font-semibold text-overdue tabular-nums"
                  >
                    <span aria-hidden="true" className="absolute inset-0 rounded-full bg-overdue/25 motion-safe:animate-ping" />
                    <span className="relative">{flagged}</span>
                  </span>
                ) : null
              }
              onExpand={() => onToggle(stage)}
              active={over === stage}
              {...dropTarget(stage)}
            />
          )
        }
        const recurring = items.reduce((sum, deal) => sum + deal.recurring_cents, 0)
        const oneTime = items.reduce((sum, deal) => sum + deal.one_time_cents, 0)
        const value = [recurring > 0 ? `${formatMoneyShort(recurring)}/mês` : null, oneTime > 0 ? `${formatMoneyShort(oneTime)} pontual` : null]
          .filter(Boolean)
          .join(" + ")
        // Em Ganho, só o principal (o mensal, ou o pontual quando não há mensal), para a dica caber.
        const wonValue = recurring > 0 ? `${formatMoneyShort(recurring)}/mês` : oneTime > 0 ? formatMoneyShort(oneTime) : null
        const hint = closed ? [`últimos ${BOARD_CLOSED_DAYS} dias`, stage === "won" ? wonValue : null].filter(Boolean).join(" · ") : value
        return (
          <KanbanColumn
            key={stage}
            index={index}
            label={DEAL_STAGE_LABEL[stage]}
            active={over === stage}
            {...dropTarget(stage)}
            header={
              <KanbanColumnHeader
                dot={<StageDot stage={stage} />}
                title={DEAL_STAGE_LABEL[stage]}
                count={items.length}
                hint={hint || null}
                action={
                  isCollapsibleStage(stage) ? (
                    <button
                      type="button"
                      onClick={() => onToggle(stage)}
                      aria-label={`Recolher ${DEAL_STAGE_LABEL[stage]}`}
                      title="Recolher"
                      className="flex size-7 items-center justify-center rounded-full text-subtle-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <ChevronsLeft className="size-4" />
                    </button>
                  ) : undefined
                }
              />
            }
          >
            {items.length === 0 ? (
              <KanbanEmpty>
                {stage === "won" ? "Arraste para cá ao fechar." : stage === "lost" ? "Nada perdido no período." : "Arraste um negócio para cá."}
              </KanbanEmpty>
            ) : (
              items.map((deal, position) => <DealCard key={deal.id} deal={deal} index={position} today={today} onOpen={onOpen} />)
            )}
          </KanbanColumn>
        )
      })}
    </KanbanBoard>
  )
}

/** Iniciais das duas primeiras palavras (sem traços e símbolos). */
function markInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word.charAt(0)))
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR"))
    .join("")
}

/** A marca do negócio: a do cliente (foto ou inicial) ou as iniciais da empresa. */
function DealMark({ deal }: { deal: Deal }) {
  const { clientById } = useWorkspace()
  if (deal.client_id && clientById.has(deal.client_id)) {
    return <ClientMark clientId={deal.client_id} size="md" className="size-8 text-xs" />
  }
  const name = deal.company ?? deal.contact_name ?? deal.title.split(" — ")[0] ?? deal.title
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs leading-none font-semibold select-none",
        clientColor(deal.company ?? deal.id)
      )}
    >
      {markInitials(name) || "?"}
    </span>
  )
}

/** Valor curto do negócio: o mensal ("R$ 2.800/mês") ou, sem mensal, o pontual. */
function dealValueLabel(deal: Deal): string | null {
  if (deal.recurring_cents > 0) return `${formatMoneyShort(deal.recurring_cents)}/mês`
  if (deal.one_time_cents > 0) return formatMoneyShort(deal.one_time_cents)
  return null
}

/** Cartão compacto, do tamanho dos cartões da referência (cerca de 4 por coluna na tela). */
function DealCard({ deal, index, today, onOpen }: { deal: Deal; index: number; today: DateKey; onOpen: (deal: Deal) => void }) {
  const { profiles, clientById } = useWorkspace()
  const owner = profiles.find((profile) => profile.id === deal.owner_id)
  const company = deal.client_id ? clientById.get(deal.client_id)?.name : deal.company
  const secondary = [company && !includesText(deal.title, company) ? company : null, deal.contact_name].filter(Boolean).join(" · ")
  const open = isOpenDeal(deal)
  const alerts = dealAlerts(deal, today)
  const late = alerts.some((alert) => alert.kind === "late")
  const idle = idleDays(deal, today)
  const value = dealValueLabel(deal)
  const valueTitle = [
    deal.recurring_cents > 0 ? `${formatMoneyShort(deal.recurring_cents)}/mês` : null,
    deal.one_time_cents > 0 ? `${formatMoneyShort(deal.one_time_cents)} pontual` : null,
  ]
    .filter(Boolean)
    .join(" + ")

  return (
    <KanbanCard id={deal.id} dragType={DRAG_TYPE} index={index}>
      <button
        type="button"
        onClick={() => onOpen(deal)}
        className="block w-full rounded-2xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex items-start gap-2.5">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm leading-5 font-semibold text-foreground">{deal.title}</span>
            {secondary ? <span className="mt-0.5 block truncate text-[13px] leading-5 text-muted-foreground">{secondary}</span> : null}
          </span>
          <DealMark deal={deal} />
        </span>

        <span className="mt-1.5 flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
          <SourceDot source={deal.source} />
          <span className="min-w-0 truncate">{LEAD_SOURCE_LABEL[deal.source]}</span>
          {value ? (
            <span className="ml-auto shrink-0 font-medium text-foreground tabular-nums" title={valueTitle}>
              {value}
              {deal.recurring_cents > 0 && deal.one_time_cents > 0 ? <span className="font-normal text-muted-foreground"> +</span> : null}
            </span>
          ) : null}
        </span>

        <span className="mt-2 flex flex-wrap gap-1">
          {deal.service ? (
            <DealTag tone="brand" icon={Tag}>
              {deal.service}
            </DealTag>
          ) : null}
          {open ? (
            <DealTag tone="neutral" title="Chance de fechar">
              {probabilityOf(deal)}%
            </DealTag>
          ) : null}
          {deal.stage === "won" ? (
            <DealTag tone="success" icon={Check}>
              Ganho
            </DealTag>
          ) : null}
          {deal.stage === "lost" ? (
            <DealTag tone="neutral" title="Motivo da perda">
              {deal.lost_reason || "Perdido"}
            </DealTag>
          ) : null}
          {alerts.map((alert) => (
            <AlertTag key={alert.kind} alert={alert} />
          ))}
        </span>

        <span className="mt-2.5 flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
          <span className="min-w-0 truncate">
            Resp: <span className="text-foreground">{owner ? firstName(owner.full_name) : "—"}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2.5 tabular-nums">
            {open ? (
              <span className="flex items-center gap-1" title={idle === 0 ? "Mudou hoje" : `Última mudança há ${idle} ${idle === 1 ? "dia" : "dias"}`}>
                <History className="size-3.5" aria-hidden="true" />
                {idle === 0 ? "hoje" : `${idle} d`}
              </span>
            ) : null}
            {open ? (
              <span
                className={cn("flex items-center gap-1", late && "font-medium text-overdue", !deal.expected_close_on && "text-subtle-foreground")}
                title={deal.expected_close_on ? "Previsão de fechamento" : "Sem previsão de fechamento"}
              >
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {deal.expected_close_on ? formatShortDate(deal.expected_close_on, today) : "—"}
              </span>
            ) : deal.closed_on ? (
              <span className="flex items-center gap-1" title={deal.stage === "won" ? "Ganho em" : "Perdido em"}>
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatShortDate(deal.closed_on, today)}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </KanbanCard>
  )
}
