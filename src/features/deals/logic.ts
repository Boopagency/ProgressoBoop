import { addPeriods, periodOf } from "@/features/clients/logic"
import { daysBetween, monthRangeOf, type DateRange } from "@/lib/dates"
import { DEAL_STAGE_PROBABILITY, LEAD_SOURCES, OPEN_DEAL_STAGES } from "@/lib/labels"
import type { DateKey, Deal, DealStage, LeadSource } from "@/lib/types"

/*
 * Regras do comercial: funções puras sobre os negócios.
 *
 * - Valor do contrato (TCV) = pontual + mensal × meses de contrato (sem prazo
 *   definido, 12 meses: o horizonte de um ano usado na projeção).
 * - Chance de fechar: a informada ou a padrão da etapa. Valor ponderado =
 *   valor × chance (a "receita potencial" realista do funil).
 * - Funil: os negócios abertos no período, contados pela etapa mais avançada
 *   que alcançaram (um perdido na proposta conta como proposta).
 * - Taxa de ganho: ganhos ÷ (ganhos + perdidos) fechados no período.
 * - Conversão de leads: dos leads que chegaram no período, quantos viraram
 *   ganho (até hoje).
 * - Ciclo de venda: dias entre a chegada do lead e o ganho.
 */

export const DEFAULT_TERM_MONTHS = 12

/** Ordem do funil (perdido fica de fora: guarda onde parou em reached_stage). */
const STAGE_RANK: Record<DealStage, number> = { lead: 0, contact: 1, proposal: 2, negotiation: 3, won: 4, lost: -1 }

export function isOpenDeal(deal: Pick<Deal, "stage">): boolean {
  return (OPEN_DEAL_STAGES as readonly DealStage[]).includes(deal.stage)
}

/** Valor total do contrato (centavos). */
export function contractValue(deal: Pick<Deal, "one_time_cents" | "recurring_cents" | "term_months">): number {
  return deal.one_time_cents + deal.recurring_cents * (deal.term_months ?? DEFAULT_TERM_MONTHS)
}

/** Chance de fechar (0–100). */
export function probabilityOf(deal: Pick<Deal, "probability" | "stage">): number {
  if (deal.stage === "won") return 100
  if (deal.stage === "lost") return 0
  return deal.probability ?? DEAL_STAGE_PROBABILITY[deal.stage]
}

export function weightedValue(deal: Pick<Deal, "one_time_cents" | "recurring_cents" | "term_months" | "probability" | "stage">): number {
  return Math.round((contractValue(deal) * probabilityOf(deal)) / 100)
}

/** O negócio chegou (em algum momento) a esta etapa? */
export function reachedStage(deal: Pick<Deal, "reached_stage" | "stage">, stage: DealStage): boolean {
  const rank = deal.stage === "won" ? STAGE_RANK.won : STAGE_RANK[deal.reached_stage]
  return rank >= STAGE_RANK[stage]
}

const within = (day: DateKey | null, range: DateRange) => day !== null && day >= range.start && day <= range.end
const sum = (deals: Deal[], value: (deal: Deal) => number) => deals.reduce((total, deal) => total + value(deal), 0)

/* ------------------------------------------------------------------ */
/* Funil aberto                                                        */
/* ------------------------------------------------------------------ */

export interface Pipeline {
  deals: Deal[]
  count: number
  /** Soma do mensal (MRR potencial). */
  recurring: number
  oneTime: number
  /** Valor total dos contratos. */
  value: number
  /** Valor × chance. */
  weighted: number
  byStage: { stage: DealStage; count: number; value: number; weighted: number }[]
  /** Negócios abertos com previsão de fechamento já passada. */
  stale: Deal[]
}

export function pipeline(deals: Deal[], today: DateKey): Pipeline {
  const open = deals.filter(isOpenDeal)
  return {
    deals: open,
    count: open.length,
    recurring: sum(open, (deal) => deal.recurring_cents),
    oneTime: sum(open, (deal) => deal.one_time_cents),
    value: sum(open, contractValue),
    weighted: sum(open, weightedValue),
    byStage: OPEN_DEAL_STAGES.map((stage) => {
      const inStage = open.filter((deal) => deal.stage === stage)
      return { stage, count: inStage.length, value: sum(inStage, contractValue), weighted: sum(inStage, weightedValue) }
    }),
    stale: open.filter((deal) => deal.expected_close_on !== null && deal.expected_close_on < today),
  }
}

/* ------------------------------------------------------------------ */
/* Desempenho num período                                              */
/* ------------------------------------------------------------------ */

export interface SalesStats {
  /** Leads que chegaram no período. */
  leads: Deal[]
  /** Propostas enviadas no período. */
  proposals: Deal[]
  won: Deal[]
  lost: Deal[]
  /** Ganhos ÷ (ganhos + perdidos) fechados no período. */
  winRate: number | null
  /** Dos leads do período, quantos viraram ganho. */
  leadConversion: number | null
  wonRecurring: number
  wonOneTime: number
  wonValue: number
  /** Valor médio dos contratos ganhos. */
  averageTicket: number | null
  /** Mensal médio dos ganhos com mensalidade. */
  averageMonthly: number | null
  /** Dias médios da chegada ao ganho. */
  cycleDays: number | null
}

export function salesStats(deals: Deal[], range: DateRange): SalesStats {
  const leads = deals.filter((deal) => within(deal.opened_on, range))
  const proposals = deals.filter((deal) => within(deal.proposal_sent_on, range))
  const won = deals.filter((deal) => deal.stage === "won" && within(deal.closed_on, range))
  const lost = deals.filter((deal) => deal.stage === "lost" && within(deal.closed_on, range))
  const recurringWins = won.filter((deal) => deal.recurring_cents > 0)
  const cycles = won.filter((deal) => deal.closed_on).map((deal) => Math.max(0, daysBetween(deal.opened_on, deal.closed_on!)))
  const wonValue = sum(won, contractValue)
  return {
    leads,
    proposals,
    won,
    lost,
    winRate: won.length + lost.length > 0 ? won.length / (won.length + lost.length) : null,
    leadConversion: leads.length > 0 ? leads.filter((deal) => deal.stage === "won").length / leads.length : null,
    wonRecurring: sum(won, (deal) => deal.recurring_cents),
    wonOneTime: sum(won, (deal) => deal.one_time_cents),
    wonValue,
    averageTicket: won.length > 0 ? Math.round(wonValue / won.length) : null,
    averageMonthly: recurringWins.length > 0 ? Math.round(sum(recurringWins, (deal) => deal.recurring_cents) / recurringWins.length) : null,
    cycleDays: cycles.length > 0 ? cycles.reduce((total, days) => total + days, 0) / cycles.length : null,
  }
}

export interface FunnelStep {
  stage: DealStage
  /** Negócios que chegaram até esta etapa. */
  count: number
  /** Em relação à etapa anterior. */
  fromPrevious: number | null
  /** Em relação aos leads. */
  fromStart: number | null
}

/** Funil dos negócios que chegaram no período (pela etapa mais avançada). */
export function funnel(deals: Deal[], range: DateRange): FunnelStep[] {
  const cohort = deals.filter((deal) => within(deal.opened_on, range))
  const stages: DealStage[] = [...OPEN_DEAL_STAGES, "won"]
  const counts = stages.map((stage) => cohort.filter((deal) => reachedStage(deal, stage)).length)
  return stages.map((stage, index) => ({
    stage,
    count: counts[index]!,
    fromPrevious: index === 0 ? null : counts[index - 1]! > 0 ? counts[index]! / counts[index - 1]! : null,
    fromStart: counts[0]! > 0 ? counts[index]! / counts[0]! : null,
  }))
}

export interface SourceStats {
  source: LeadSource
  leads: number
  won: number
  wonValue: number
  conversion: number | null
}

/** Origem dos leads do período: quantos chegaram, quantos fecharam e quanto renderam. */
export function bySource(deals: Deal[], range: DateRange): SourceStats[] {
  const cohort = deals.filter((deal) => within(deal.opened_on, range))
  return LEAD_SOURCES.map((source) => {
    const leads = cohort.filter((deal) => deal.source === source)
    const won = leads.filter((deal) => deal.stage === "won")
    return {
      source,
      leads: leads.length,
      won: won.length,
      wonValue: sum(won, contractValue),
      conversion: leads.length > 0 ? won.length / leads.length : null,
    }
  })
    .filter((row) => row.leads > 0)
    .sort((a, b) => b.leads - a.leads || b.wonValue - a.wonValue)
}

export interface SalesMonth {
  period: DateKey
  leads: number
  won: number
  lost: number
  wonRecurring: number
  wonValue: number
}

/** Leads, ganhos e perdidos mês a mês. */
export function salesByMonth(deals: Deal[], periods: DateKey[]): SalesMonth[] {
  return periods.map((period) => {
    const stats = salesStats(deals, monthRangeOf(period))
    return {
      period,
      leads: stats.leads.length,
      won: stats.won.length,
      lost: stats.lost.length,
      wonRecurring: stats.wonRecurring,
      wonValue: stats.wonValue,
    }
  })
}

/** Fechamentos previstos por mês (valor ponderado dos abertos com previsão). */
export function expectedByMonth(deals: Deal[], periods: DateKey[]): { period: DateKey; weighted: number; recurring: number; count: number }[] {
  const open = deals.filter(isOpenDeal)
  return periods.map((period) => {
    const inMonth = open.filter((deal) => deal.expected_close_on !== null && periodOf(deal.expected_close_on) === period)
    return {
      period,
      weighted: sum(inMonth, weightedValue),
      recurring: Math.round(sum(inMonth, (deal) => (deal.recurring_cents * probabilityOf(deal)) / 100)),
      count: inMonth.length,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Quadro                                                              */
/* ------------------------------------------------------------------ */

/** Ganhos e perdidos aparecem no quadro por 30 dias depois de fechados. */
export const BOARD_CLOSED_DAYS = 30

export function boardColumns(deals: Deal[], today: DateKey): Record<DealStage, Deal[]> {
  const columns: Record<DealStage, Deal[]> = { lead: [], contact: [], proposal: [], negotiation: [], won: [], lost: [] }
  for (const deal of deals) {
    if (!isOpenDeal(deal) && (!deal.closed_on || daysBetween(deal.closed_on, today) > BOARD_CLOSED_DAYS)) continue
    columns[deal.stage].push(deal)
  }
  for (const stage of Object.keys(columns) as DealStage[]) {
    columns[stage].sort((a, b) => {
      if (stage === "won" || stage === "lost") return (b.closed_on ?? "").localeCompare(a.closed_on ?? "")
      // Previsão de fechamento mais próxima primeiro; sem previsão, o maior valor.
      const dueA = a.expected_close_on ?? "9999"
      const dueB = b.expected_close_on ?? "9999"
      return dueA === dueB ? contractValue(b) - contractValue(a) : dueA < dueB ? -1 : 1
    })
  }
  return columns
}

/** Motivos de perda mais comuns (dá para escrever outro). */
export const LOST_REASONS = [
  "Preço",
  "Escolheu outra agência",
  "Sem orçamento agora",
  "Parou de responder",
  "Adiou o projeto",
  "Fora do nosso perfil",
] as const

/** Mês (dia 1) em que o contrato de um negócio ganho começa: o próximo mês. */
export function defaultContractStart(today: DateKey): DateKey {
  return addPeriods(periodOf(today), 1)
}
