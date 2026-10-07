"use client"

import { ArrowRight, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useOptimistic, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { KpiTile } from "@/components/kpi-tile"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateDeal } from "@/features/deals/actions"
import { DealDialog, type DealDialogState } from "@/features/deals/deal-dialog"
import {
  BOARD_CLOSED_DAYS,
  boardColumns,
  contractValue,
  isOpenDeal,
  LOST_REASONS,
  pipeline,
  probabilityOf,
  salesStats,
} from "@/features/deals/logic"
import { WinDialog } from "@/features/deals/win-dialog"
import { formatMoney, formatMoneyShort } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { addDaysToKey, formatShortDate, monthRangeOf } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import { includesText } from "@/lib/text"
import { DEAL_STAGE_LABEL, DEAL_STAGES, LEAD_SOURCE_LABEL, OPEN_DEAL_STAGES } from "@/lib/labels"
import type { DateKey, Deal, DealStage } from "@/lib/types"
import { cn } from "@/lib/utils"

const DRAG_TYPE = "application/x-boop-deal"
const ALL = "all"

type ListFilter = "open" | "won" | "lost" | "all"

/** Tela Comercial: funil em quadro (arrastar muda a etapa) ou lista, com os números do funil. */
export function DealsView({ deals, today }: { deals: Deal[]; today: DateKey }) {
  const { profiles, clientById, currentUser } = useWorkspace()
  const [view, setView] = useState<"board" | "list">("board")
  const [owner, setOwner] = useState<string>(ALL)
  const [query, setQuery] = useState("")
  const [listFilter, setListFilter] = useState<ListFilter>("open")
  const [dialog, setDialog] = useState<DealDialogState>({ open: false, key: 0 })
  const [winning, setWinning] = useState<Deal | null>(null)
  const [losing, setLosing] = useState<Deal | null>(null)
  const [, startTransition] = useTransition()
  const [optimistic, moveOptimistic] = useOptimistic(deals, (current: Deal[], change: { id: string; stage: DealStage }) =>
    current.map((deal) => (deal.id === change.id ? { ...deal, stage: change.stage } : deal))
  )
  useUrlTrigger(() => setDialog((state) => ({ open: true, key: state.key + 1 })))
  // ?negocio=<id> (busca, indicadores): abre o negócio uma vez.
  const requested = useSearchParams().get("negocio")
  const [seenRequest, setSeenRequest] = useState<string | null>(null)
  if (requested && requested !== seenRequest) {
    setSeenRequest(requested)
    const deal = deals.find((candidate) => candidate.id === requested)
    if (deal) setDialog((state) => ({ open: true, key: state.key + 1, deal }))
  }

  const visible = optimistic.filter((deal) => {
    if (owner === "me" && deal.owner_id !== currentUser.id) return false
    if (owner !== ALL && owner !== "me" && deal.owner_id !== owner) return false
    if (query.trim()) {
      const client = deal.client_id ? clientById.get(deal.client_id)?.name : ""
      if (!includesText(`${deal.title} ${deal.company ?? ""} ${deal.contact_name ?? ""} ${client ?? ""} ${deal.service ?? ""}`, query)) return false
    }
    return true
  })
  const funnel = pipeline(visible, today)
  const month = salesStats(visible, monthRangeOf(today))
  const quarter = salesStats(visible, { start: addDaysToKey(today, -89), end: today })

  function openDeal(deal: Deal) {
    setDialog((state) => ({ open: true, key: state.key + 1, deal }))
  }

  function move(id: string, stage: DealStage) {
    const deal = optimistic.find((candidate) => candidate.id === id)
    if (!deal || deal.stage === stage) return
    if (stage === "won") {
      setWinning(deal)
      return
    }
    if (stage === "lost") {
      setLosing(deal)
      return
    }
    if (deal.stage === "won") {
      toast("Para reabrir um negócio ganho, abra o negócio e use “Reabrir”.")
      return
    }
    startTransition(async () => {
      moveOptimistic({ id, stage })
      const result = await updateDeal(id, { stage })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <PageContainer className="max-w-[1400px]">
      <PageHeader
        title="Comercial"
        description="Leads, propostas e negócios, do primeiro contato ao contrato"
        actions={
          <>
            <Button variant="ghost" asChild className="gap-1 text-muted-foreground">
              <Link href="/indicadores?area=comercial">
                Indicadores
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button onClick={() => setDialog((state) => ({ open: true, key: state.key + 1 }))} className="gap-1.5">
              <Plus />
              Novo negócio
            </Button>
          </>
        }
      />

      <section aria-label="Números do funil" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Em aberto"
          value={`${funnel.count} ${funnel.count === 1 ? "negócio" : "negócios"}`}
          hint={`${formatMoneyShort(funnel.recurring)}/mês em potencial${funnel.oneTime > 0 ? ` + ${formatMoneyShort(funnel.oneTime)} pontual` : ""}`}
        />
        <KpiTile
          label="Valor ponderado"
          value={formatMoney(funnel.weighted)}
          hint={`de ${formatMoneyShort(funnel.value)} em contratos, pela chance de cada um`}
        />
        <KpiTile
          label="Ganhos no mês"
          value={`${month.won.length} ${month.won.length === 1 ? "negócio" : "negócios"}`}
          hint={`${formatMoneyShort(month.wonRecurring)}/mês${month.wonOneTime > 0 ? ` + ${formatMoneyShort(month.wonOneTime)} pontual` : ""} · ${month.leads.length} leads novos`}
          href="/indicadores?area=comercial"
        />
        <KpiTile
          label="Taxa de ganho (90 dias)"
          value={formatPercent(quarter.winRate, true)}
          hint={
            quarter.cycleDays !== null
              ? `${quarter.won.length} ganhos, ${quarter.lost.length} perdidos · ciclo de ${Math.round(quarter.cycleDays)} dias`
              : `${quarter.won.length} ganhos, ${quarter.lost.length} perdidos`
          }
          href="/indicadores?area=comercial"
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Visualização"
          value={view}
          onValueChange={setView}
          options={[
            { value: "board", label: "Quadro" },
            { value: "list", label: "Lista" },
          ]}
        />
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar negócio, empresa…" aria-label="Buscar" className="h-8 pl-8 text-[13px]" />
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger size="sm" aria-label="Responsável" className={cn("h-8 w-auto shadow-none", owner !== ALL && "border-brand/60")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="me">Meus</SelectItem>
            {profiles
              .filter((profile) => profile.id !== currentUser.id)
              .map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {firstName(profile.full_name)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {view === "list" ? (
          <SegmentedControl
            aria-label="Situação"
            value={listFilter}
            onValueChange={setListFilter}
            options={[
              { value: "open", label: "Abertos" },
              { value: "won", label: "Ganhos" },
              { value: "lost", label: "Perdidos" },
              { value: "all", label: "Todos" },
            ]}
          />
        ) : null}
      </div>

      {deals.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <h2 className="text-sm font-semibold">Cadastre os leads que estão chegando</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cada negócio guarda a origem, o valor mensal e o pontual, a etapa e a previsão de fechamento. Ganhou? Ele vira
            cliente, contrato no financeiro e projeto, sem digitar de novo.
          </p>
          <Button size="sm" className="mt-5" onClick={() => setDialog((state) => ({ open: true, key: state.key + 1 }))}>
            Primeiro negócio
          </Button>
        </div>
      ) : view === "board" ? (
        <Board deals={visible} today={today} onOpen={openDeal} onMove={move} />
      ) : (
        <DealList
          deals={visible.filter((deal) => (listFilter === "all" ? true : listFilter === "open" ? isOpenDeal(deal) : deal.stage === listFilter))}
          today={today}
          onOpen={openDeal}
        />
      )}

      <DealDialog state={dialog} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} onWin={setWinning} />
      <WinDialog deal={winning} onOpenChange={(open) => !open && setWinning(null)} />
      <LostDialog deal={losing} onOpenChange={(open) => !open && setLosing(null)} />
    </PageContainer>
  )
}

/** Área que recebe um cartão arrastado (muda a etapa do negócio). */
function DropZone({
  stage,
  over,
  setOver,
  onMove,
  className,
  children,
}: {
  stage: DealStage
  over: DealStage | null
  setOver: (stage: DealStage | null) => void
  onMove: (id: string, stage: DealStage) => void
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={DEAL_STAGE_LABEL[stage]}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        if (over !== stage) setOver(stage)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(null)
        const id = event.dataTransfer.getData(DRAG_TYPE)
        if (id) onMove(id, stage)
      }}
      className={cn("flex flex-col rounded-xl border bg-muted/30 transition-colors", over === stage && "border-brand/50 bg-brand-soft/30", className)}
    >
      {children}
    </section>
  )
}

function StageHeader({ stage, count, hint }: { stage: DealStage; count: number; hint: string }) {
  return (
    <header className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            stage === "won" ? "bg-brand" : stage === "lost" ? "bg-muted-foreground/40" : "border-2 border-brand/60 bg-transparent"
          )}
        />
        <h2 className="text-[13px] font-semibold text-foreground">{DEAL_STAGE_LABEL[stage]}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>
    </header>
  )
}

/**
 * Quadro: as quatro etapas abertas e, na última coluna, ganhos e perdidos dos
 * últimos 30 dias. Arrastar muda a etapa; soltar em Ganho abre a conversão.
 */
function Board({
  deals,
  today,
  onOpen,
  onMove,
}: {
  deals: Deal[]
  today: DateKey
  onOpen: (deal: Deal) => void
  onMove: (id: string, stage: DealStage) => void
}) {
  const [over, setOver] = useState<DealStage | null>(null)
  const columns = boardColumns(deals, today)
  const column = "w-[78%] shrink-0 snap-start sm:w-64 xl:w-auto xl:min-w-0 xl:flex-1"
  return (
    <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:snap-none">
      {OPEN_DEAL_STAGES.map((stage) => {
        const items = columns[stage]
        const total = items.reduce((sum, deal) => sum + deal.recurring_cents, 0)
        return (
          <DropZone key={stage} stage={stage} over={over} setOver={setOver} onMove={onMove} className={column}>
            <StageHeader stage={stage} count={items.length} hint={total > 0 ? `${formatMoneyShort(total)}/mês` : " "} />
            <div role="list" className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-subtle-foreground">Nenhum negócio.</p>
              ) : (
                items.map((deal) => <DealCard key={deal.id} deal={deal} today={today} onOpen={onOpen} />)
              )}
            </div>
          </DropZone>
        )
      })}
      <div className={cn("flex flex-col gap-3", column)}>
        {(["won", "lost"] as const).map((stage) => (
          <DropZone key={stage} stage={stage} over={over} setOver={setOver} onMove={onMove}>
            <StageHeader stage={stage} count={columns[stage].length} hint={`últimos ${BOARD_CLOSED_DAYS} dias`} />
            <div role="list" className="flex flex-col gap-2 px-2 pb-2">
              {columns[stage].length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-subtle-foreground">
                  {stage === "won" ? "Arraste para cá ao fechar." : "Nada perdido no período."}
                </p>
              ) : (
                columns[stage].map((deal) => <DealCard key={deal.id} deal={deal} today={today} onOpen={onOpen} />)
              )}
            </div>
          </DropZone>
        ))}
      </div>
    </div>
  )
}

function DealCard({ deal, today, onOpen }: { deal: Deal; today: DateKey; onOpen: (deal: Deal) => void }) {
  const { profiles, clientById } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === deal.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  const company = deal.client_id ? clientById.get(deal.client_id)?.name : deal.company
  const late = isOpenDeal(deal) && deal.expected_close_on !== null && deal.expected_close_on < today
  return (
    <div
      role="listitem"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, deal.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      className="rounded-lg border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_6px_0_rgb(0_0_0/0.08)]"
    >
      <button
        type="button"
        onClick={() => onOpen(deal)}
        className="block w-full rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="line-clamp-2 text-[13.5px] leading-5 font-medium text-foreground">{deal.title}</span>
        {company ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{company}</span> : null}
        <span className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] whitespace-nowrap text-foreground tabular-nums">
          {deal.recurring_cents > 0 ? <span className="font-medium">{formatMoneyShort(deal.recurring_cents)}/mês</span> : null}
          {deal.one_time_cents > 0 ? (
            <span className={deal.recurring_cents > 0 ? "text-xs text-muted-foreground" : "font-medium"}>
              {deal.recurring_cents > 0 ? "+ " : ""}
              {formatMoneyShort(deal.one_time_cents)}
            </span>
          ) : null}
          {deal.recurring_cents === 0 && deal.one_time_cents === 0 ? <span className="text-xs text-subtle-foreground">sem valor</span> : null}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
          {isOpenDeal(deal) ? (
            <span className={cn("tabular-nums", late && "font-medium text-overdue")}>
              {deal.expected_close_on ? `${late ? "Previa " : "Fecha "}${formatShortDate(deal.expected_close_on, today)}` : LEAD_SOURCE_LABEL[deal.source]}
            </span>
          ) : (
            <span className="tabular-nums">{deal.closed_on ? formatShortDate(deal.closed_on, today) : ""}</span>
          )}
          {isOpenDeal(deal) ? <span className="tabular-nums">{probabilityOf(deal)}%</span> : null}
          {owner ? (
            <PersonAvatar
              name={owner.full_name}
              avatarUrl={owner.avatar_url}
              colorIndex={ownerIndex}
              size="sm"
              className="ml-auto size-5 [&_[data-slot=avatar-fallback]]:text-[10px]"
            />
          ) : null}
        </span>
      </button>
    </div>
  )
}

function DealList({ deals, today, onOpen }: { deals: Deal[]; today: DateKey; onOpen: (deal: Deal) => void }) {
  const { profileById, clientById } = useWorkspace()
  const sorted = [...deals].sort((a, b) => {
    const order = DEAL_STAGES.indexOf(b.stage) - DEAL_STAGES.indexOf(a.stage)
    if (isOpenDeal(a) && isOpenDeal(b) && order !== 0) return order
    return b.updated_at.localeCompare(a.updated_at)
  })
  if (sorted.length === 0) return <p className="mt-6 text-center text-[13px] text-muted-foreground">Nenhum negócio com esses filtros.</p>
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[900px] text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">Negócio</th>
            <th scope="col" className="px-3 py-2 font-medium">Etapa</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Mensal</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Pontual</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Contrato</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Chance</th>
            <th scope="col" className="px-3 py-2 font-medium">Fechamento</th>
            <th scope="col" className="px-3 py-2 font-medium">Origem</th>
            <th scope="col" className="px-4 py-2 font-medium">Responsável</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => {
            const owner = deal.owner_id ? profileById.get(deal.owner_id) : undefined
            const company = deal.client_id ? clientById.get(deal.client_id)?.name : deal.company
            const late = isOpenDeal(deal) && deal.expected_close_on !== null && deal.expected_close_on < today
            return (
              <tr key={deal.id} onClick={() => onOpen(deal)} className="cursor-pointer border-t transition-colors hover:bg-muted/40">
                <td className="max-w-[300px] px-4 py-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(deal)
                    }}
                    className="block max-w-full truncate text-left font-medium text-foreground outline-none focus-visible:underline"
                  >
                    {deal.title}
                  </button>
                  {company ? <span className="block truncate text-xs text-muted-foreground">{company}</span> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={cn(deal.stage === "won" && "text-brand-ink", deal.stage === "lost" && "text-muted-foreground")}>{DEAL_STAGE_LABEL[deal.stage]}</span>
                  {deal.stage === "lost" && deal.lost_reason ? <span className="block max-w-40 truncate text-xs text-muted-foreground">{deal.lost_reason}</span> : null}
                </td>
                <td className="px-3 py-2 text-right">{deal.recurring_cents > 0 ? formatMoneyShort(deal.recurring_cents) : "—"}</td>
                <td className="px-3 py-2 text-right">{deal.one_time_cents > 0 ? formatMoneyShort(deal.one_time_cents) : "—"}</td>
                <td className="px-3 py-2 text-right">{formatMoneyShort(contractValue(deal))}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{probabilityOf(deal)}%</td>
                <td className={cn("px-3 py-2 whitespace-nowrap", late ? "font-medium text-overdue" : "text-muted-foreground")}>
                  {deal.closed_on
                    ? formatShortDate(deal.closed_on, today)
                    : deal.expected_close_on
                      ? `${late ? "previa " : "prev. "}${formatShortDate(deal.expected_close_on, today)}`
                      : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{LEAD_SOURCE_LABEL[deal.source]}</td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{owner ? firstName(owner.full_name) : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LostDialog({ deal, onOpenChange }: { deal: Deal | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={deal !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogTitle>Negócio perdido</DialogTitle>
        <DialogDescription>{deal?.title}</DialogDescription>
        {deal ? <LostForm key={deal.id} deal={deal} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function LostForm({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()
  function submit() {
    startTransition(async () => {
      const result = await updateDeal(deal.id, { stage: "lost", lost_reason: reason || null })
      if (!result.ok) toast.error(result.error)
      else {
        toast("Negócio perdido", { description: reason ? `Motivo: ${reason}` : deal.title })
        onDone()
      }
    })
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <p className="text-[13px] font-medium text-foreground">Por que perdemos?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {LOST_REASONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setReason(option)}
            className={cn(
              "h-7 rounded-full border px-2.5 text-xs transition-colors",
              reason === option ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Ou escreva o motivo" aria-label="Motivo" className="mt-2 h-9" />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
          Marcar como perdido
        </Button>
      </div>
    </form>
  )
}

