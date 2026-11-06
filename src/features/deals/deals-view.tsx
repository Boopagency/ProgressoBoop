"use client"

import { ArrowRight, Handshake, Megaphone, Plus, Search, UserRound } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useOptimistic, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageToolbar } from "@/components/layout/page"
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
import { ViewFade } from "@/components/view-fade"
import { updateDeal } from "@/features/deals/actions"
import { DEALS_COLLAPSED_COOKIE, serializeCollapsedStages } from "@/features/deals/constants"
import { AlertTag, DealBoard, SourceDot, StageDot } from "@/features/deals/deal-board"
import { DealDialog, type DealDialogState } from "@/features/deals/deal-dialog"
import {
  attentionSummary,
  COLLAPSIBLE_STAGES,
  contractValue,
  dealAlerts,
  isOpenDeal,
  LOST_REASONS,
  pipeline,
  probabilityOf,
  salesStats,
  STALE_DAYS,
  type DealAlertKind,
} from "@/features/deals/logic"
import { WinDialog } from "@/features/deals/win-dialog"
import { formatMoneyShort } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { addDaysToKey, formatShortDate, monthRangeOf } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import { includesText } from "@/lib/text"
import { DEAL_STAGE_LABEL, DEAL_STAGES, LEAD_SOURCE_LABEL, LEAD_SOURCES } from "@/lib/labels"
import type { DateKey, Deal, DealStage, LeadSource } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"

type ListFilter = "open" | "won" | "lost" | "all"

/** Pílula dos filtros (busca, selects e chaves), como nas outras telas. */
const FILTER_PILL =
  "h-9 rounded-full border border-glass-edge bg-card text-[13px] shadow-[inset_0_1px_0_var(--glass-highlight)] dark:bg-card"
const FILTER_PILL_ACTIVE = "border-glow/45 bg-glow-soft font-medium text-foreground dark:bg-glow-soft"

/**
 * Tela Comercial: a frase do funil (quantos estão em aberto e quantos pedem
 * atenção), os filtros e o quadro por etapa (arrastar muda a etapa), com
 * pré-venda e saída recolhíveis, ou a lista.
 */
export function DealsView({
  deals,
  today,
  initialCollapsed = COLLAPSIBLE_STAGES,
}: {
  deals: Deal[]
  today: DateKey
  /** Etapas recolhidas no quadro (preferência da pessoa, do cookie). */
  initialCollapsed?: readonly DealStage[]
}) {
  const { profiles, clientById, currentUser } = useWorkspace()
  const [view, setView] = useState<"board" | "list">("board")
  const [owner, setOwner] = useState<string>(ALL)
  const [source, setSource] = useState<string>(ALL)
  const [query, setQuery] = useState("")
  const [alertOnly, setAlertOnly] = useState(false)
  const [listFilter, setListFilter] = useState<ListFilter>("open")
  const [collapsed, setCollapsed] = useState<readonly DealStage[]>(initialCollapsed)
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

  // Os filtros de pessoa, origem e busca valem para a frase e para o quadro; "Só com alerta", só para o quadro e a lista.
  const filtered = optimistic.filter((deal) => {
    if (owner === "me" && deal.owner_id !== currentUser.id) return false
    if (owner !== ALL && owner !== "me" && deal.owner_id !== owner) return false
    if (source !== ALL && deal.source !== source) return false
    if (query.trim()) {
      const client = deal.client_id ? clientById.get(deal.client_id)?.name : ""
      if (!includesText(`${deal.title} ${deal.company ?? ""} ${deal.contact_name ?? ""} ${client ?? ""} ${deal.service ?? ""}`, query)) return false
    }
    return true
  })
  const visible = alertOnly ? filtered.filter((deal) => dealAlerts(deal, today).length > 0) : filtered
  const funnel = pipeline(filtered, today)
  const attention = attentionSummary(funnel.deals, today)
  const month = salesStats(filtered, monthRangeOf(today))
  const quarter = salesStats(filtered, { start: addDaysToKey(today, -89), end: today })
  const sources = LEAD_SOURCES.filter((option) => option === source || deals.some((deal) => deal.source === option))
  const allShown = collapsed.length === 0
  const board = view === "board" && deals.length > 0

  function openDeal(deal: Deal) {
    setDialog((state) => ({ open: true, key: state.key + 1, deal }))
  }

  function newDeal() {
    setDialog((state) => ({ open: true, key: state.key + 1 }))
  }

  function saveCollapsed(next: readonly DealStage[]) {
    setCollapsed(next)
    document.cookie = `${DEALS_COLLAPSED_COOKIE}=${serializeCollapsedStages(next)}; path=/; max-age=31536000; samesite=lax`
  }

  function toggleStage(stage: DealStage) {
    saveCollapsed(collapsed.includes(stage) ? collapsed.filter((item) => item !== stage) : [...collapsed, stage])
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
    // No quadro, a tela ocupa a altura da janela e as colunas rolam por dentro.
    <PageContainer className={cn(board && "md:flex md:h-full md:flex-col md:pb-6")}>
      <Headline
        open={funnel.count}
        attention={attention.deals.length}
        counts={attention.counts}
        recurring={funnel.recurring}
        oneTime={funnel.oneTime}
        weighted={funnel.weighted}
        wonInMonth={month.won.length}
        winRate={quarter.winRate}
        actions={
          <>
            <Button variant="ghost" asChild className="gap-1 text-muted-foreground">
              <Link href="/indicadores?area=comercial">
                Indicadores
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button onClick={newDeal} className="gap-1.5">
              <Plus />
              Novo negócio
            </Button>
          </>
        }
      />

      <PageToolbar className="mt-8">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar negócio ou contato"
            aria-label="Buscar"
            className={cn(FILTER_PILL, "pl-9")}
          />
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger size="sm" aria-label="Responsável" className={cn(FILTER_PILL, "w-auto gap-1.5 px-3.5 [&>svg:first-child]:size-3.5", owner !== ALL && FILTER_PILL_ACTIVE)}>
            <UserRound className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
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
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger size="sm" aria-label="Origem" className={cn(FILTER_PILL, "w-auto gap-1.5 px-3.5 [&>svg:first-child]:size-3.5", source !== ALL && FILTER_PILL_ACTIVE)}>
            <Megaphone className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Todas as origens</SelectItem>
            {sources.map((option) => (
              <SelectItem key={option} value={option}>
                <SourceDot source={option as LeadSource} />
                {LEAD_SOURCE_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleChip active={alertOnly} onClick={() => setAlertOnly((value) => !value)}>
          Só com alerta
          {attention.deals.length > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{attention.deals.length}</span> : null}
        </ToggleChip>
        {view === "board" ? (
          <ToggleChip active={allShown} onClick={() => saveCollapsed(allShown ? COLLAPSIBLE_STAGES : [])}>
            Pré-venda e saída
          </ToggleChip>
        ) : (
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
        )}
        <SegmentedControl
          aria-label="Visualização"
          value={view}
          onValueChange={setView}
          className="sm:ml-auto"
          options={[
            { value: "board", label: "Quadro" },
            { value: "list", label: "Lista" },
          ]}
        />
      </PageToolbar>

      <PageBody className={cn(board && "md:min-h-0 md:flex-1")}>
        <ViewFade view={`${view}:${listFilter}`} className={cn(board && "md:flex md:min-h-0 md:flex-1 md:flex-col")}>
          {deals.length === 0 ? (
            <EmptyPanel
              icon={Handshake}
              title="Cadastre os leads que estão chegando"
              action={
                <Button onClick={newDeal} className="gap-1.5">
                  <Plus />
                  Primeiro negócio
                </Button>
              }
            >
              Cada negócio guarda a origem, o valor mensal e o pontual, a etapa e a previsão de fechamento. Ganhou? Ele vira
              cliente, contrato no financeiro e projeto, sem digitar de novo.
            </EmptyPanel>
          ) : view === "board" ? (
            <DealBoard
              deals={visible}
              today={today}
              collapsed={collapsed}
              onToggle={toggleStage}
              onOpen={openDeal}
              onMove={move}
              className="h-[calc(100svh-11rem)] min-h-[26rem] md:h-auto md:min-h-[26rem] md:flex-1"
            />
          ) : (
            <DealList
              deals={visible.filter((deal) => (listFilter === "all" ? true : listFilter === "open" ? isOpenDeal(deal) : deal.stage === listFilter))}
              today={today}
              onOpen={openDeal}
            />
          )}
        </ViewFade>
      </PageBody>

      <DealDialog state={dialog} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} onWin={setWinning} />
      <WinDialog deal={winning} onOpenChange={(open) => !open && setWinning(null)} />
      <LostDialog deal={losing} onOpenChange={(open) => !open && setLosing(null)} />
    </PageContainer>
  )
}

/** Chave dos filtros (ligada: o ponto acende e a pílula fica azul). */
function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        FILTER_PILL,
        "inline-flex items-center gap-2 px-3.5 text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
        active && FILTER_PILL_ACTIVE
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full transition-[background-color,box-shadow]", active ? "bg-glow shadow-[0_0_8px_var(--glow)]" : "bg-muted-foreground/35")}
      />
      {children}
    </button>
  )
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * A frase do funil, no lugar do título: quantos negócios estão em aberto e
 * quantos pedem atenção (atrasados, sem contato ou parados). Ao lado, os
 * valores do funil e a legenda das etiquetas.
 */
function Headline({
  open,
  attention,
  counts,
  recurring,
  oneTime,
  weighted,
  wonInMonth,
  winRate,
  actions,
}: {
  open: number
  attention: number
  counts: Record<DealAlertKind, number>
  recurring: number
  oneTime: number
  weighted: number
  wonInMonth: number
  winRate: number | null
  actions: ReactNode
}) {
  const alertParts = [
    counts.late > 0 ? plural(counts.late, "atrasado", "atrasados") : null,
    counts.no_contact > 0 ? `${counts.no_contact} sem contato` : null,
    counts.stale > 0 ? plural(counts.stale, "parado", "parados") : null,
  ].filter((part): part is string => part !== null)
  const strong = "font-medium whitespace-nowrap text-foreground"
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0">
        <span className="inline-flex h-7 items-center gap-2 rounded-full border border-glass-edge bg-card px-3 text-xs font-medium text-muted-foreground shadow-[inset_0_1px_0_var(--glass-highlight)]">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_6px_var(--glow)]" />
          Quadro · as etapas do funil
        </span>
        <h1 className="mt-4 font-display text-[34px] leading-[1.1] font-medium tracking-[-0.04em] text-balance text-foreground sm:text-[46px] xl:text-[56px] [&_em]:emphasis [&_em]:pr-[0.04em] [&_em]:text-[1.1em] [&_em]:leading-none [&_em]:text-brand-ink">
          {open > 0 ? (
            <>
              <span className="text-gradient-brand">{plural(open, "negócio", "negócios")}</span> em aberto no funil.
            </>
          ) : (
            <>Nenhum negócio em aberto no funil.</>
          )}
          <br />
          {attention > 0 ? (
            <>
              <span className="mr-[0.18em] inline-flex h-[1.12em] min-w-[1.5em] items-center justify-center rounded-full border-[3px] border-foreground/85 px-[0.28em] align-[-0.16em] leading-none tabular-nums">
                {attention}
              </span>
              {attention === 1 ? "pede" : "pedem"} <em>atenção</em>.
            </>
          ) : open > 0 ? (
            <>
              Nenhum pede <em>atenção</em>.
            </>
          ) : (
            <>
              Hora de cadastrar o próximo <em>lead</em>.
            </>
          )}
        </h1>
      </div>
      <div className="flex shrink-0 flex-col gap-4 lg:max-w-[23rem] lg:items-end lg:text-right">
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        <div className="space-y-2 text-[13px] leading-5 text-muted-foreground">
          <p>
            <span className={strong}>{formatMoneyShort(recurring)}/mês</span> em potencial
            {oneTime > 0 ? (
              <>
                {" "}
                + <span className={strong}>{formatMoneyShort(oneTime)}</span> pontual
              </>
            ) : null}{" "}
            e <span className={strong}>{formatMoneyShort(weighted)}</span> ponderado pela chance. No mês,{" "}
            <span className={strong}>{plural(wonInMonth, "ganho", "ganhos")}</span>
            {winRate !== null ? (
              <>
                ; taxa de ganho de <span className={strong}>{formatPercent(winRate, true)}</span> em 90 dias
              </>
            ) : null}
            .
          </p>
          <p className="max-sm:hidden">
            {alertParts.length > 0 ? <>Hoje: {joinParts(alertParts)}. </> : null}
            Vermelho é atrasado ou sem contato; âmbar, parado há {STALE_DAYS} dias ou mais. Clique no cartão para abrir.
          </p>
        </div>
      </div>
    </div>
  )
}

/** "a, b e c" */
function joinParts(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`
}

function DealList({ deals, today, onOpen }: { deals: Deal[]; today: DateKey; onOpen: (deal: Deal) => void }) {
  const { profileById, clientById } = useWorkspace()
  const sorted = [...deals].sort((a, b) => {
    const order = DEAL_STAGES.indexOf(b.stage) - DEAL_STAGES.indexOf(a.stage)
    if (isOpenDeal(a) && isOpenDeal(b) && order !== 0) return order
    return b.updated_at.localeCompare(a.updated_at)
  })
  if (sorted.length === 0)
    return (
      <p className="rounded-3xl border border-dashed border-foreground/15 px-4 py-8 text-center text-[13px] text-muted-foreground">
        Nenhum negócio com esses filtros.
      </p>
    )
  return (
    <div className="scrollbar-soft overflow-x-auto rounded-3xl border bg-card-solid">
      <table className="w-full min-w-[960px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[10.5px] text-subtle-foreground [&>th]:eyebrow [&>th]:py-3 [&>th]:text-[10.5px]">
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
            const alerts = dealAlerts(deal, today)
            return (
              <tr key={deal.id} onClick={() => onOpen(deal)} className="cursor-pointer border-t transition-colors hover:bg-muted/40 [&>td]:py-3.5">
                <td className="max-w-[340px] px-4 py-2">
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
                  {company || deal.contact_name ? (
                    <span className="block truncate text-[13px] text-muted-foreground">{[company, deal.contact_name].filter(Boolean).join(" · ")}</span>
                  ) : null}
                  {alerts.length > 0 ? (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {alerts.map((alert) => (
                        <AlertTag key={alert.kind} alert={alert} />
                      ))}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={cn("inline-flex items-center gap-2", deal.stage === "won" && "text-success-strong", deal.stage === "lost" && "text-muted-foreground")}>
                    <StageDot stage={deal.stage} className="size-2" />
                    {DEAL_STAGE_LABEL[deal.stage]}
                  </span>
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
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <SourceDot source={deal.source} />
                    {LEAD_SOURCE_LABEL[deal.source]}
                  </span>
                </td>
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
              reason === option ? "border-primary bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"
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

