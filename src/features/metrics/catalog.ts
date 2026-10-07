import { addPeriods, currentHealth, periodOf, reviewDue } from "@/features/clients/logic"
import {
  contractValue,
  isOpenDeal,
  probabilityOf,
  salesStats,
  weightedValue,
} from "@/features/deals/logic"
import { monthItems, type FinanceItem } from "@/features/finance/logic"
import {
  activeClientIds,
  delinquency,
  DRE_LINE_ACCOUNTS,
  dreItems,
  dreMonth,
  fixedCostsMonthly,
  ledgerBalance,
  mrr,
  mrrMovement,
  periodsOf,
  recurringIn,
  REVENUE_ACCOUNTS,
  requiredRevenue,
  sumDre,
  type FinanceData,
  type FinanceIndex,
} from "@/features/finance/management"
import { formatMoney } from "@/features/finance/money"
import { addDaysToKey, daysBetween, formatMonthYear, formatShortDate, monthRangeOf, toDateKey, type DateRange } from "@/lib/dates"
import { DEAL_STAGE_LABEL, FINANCE_ACCOUNT_LABEL, LEAD_SOURCE_LABEL, PROJECT_STATUS_LABEL } from "@/lib/labels"
import type { ClientDetail, ClientReview, DateKey, Deal, MetricUnit, Project, Task } from "@/lib/types"

/*
 * Catálogo de indicadores: cada um tem nome, unidade, direção boa, como é
 * calculado (em texto, para a tela de detalhe), o valor num período e os
 * dados que formam o número. Tudo sai dos dados do sistema; nada é digitado.
 *
 * - Dinheiro em centavos; percentuais em pontos (25 = 25%).
 * - Indicadores de fluxo somam o período; de estoque, valem no fim dele (ou
 *   hoje, no período atual).
 * - Financeiro no mesmo critério do DRE: no mês atual, o realizado mais o que
 *   ainda vence nele.
 */

export interface MetricsSource {
  finance: FinanceData
  deals: Deal[]
  tasks: Task[]
  projects: Project[]
  clients: ClientDetail[]
  reviews: ClientReview[]
}

export interface MetricContext extends MetricsSource {
  index: FinanceIndex
  today: DateKey
  /** Indicador de um cliente só (metas por cliente). */
  clientId?: string | null
  /** Só o realizado (sem o que ainda vence no mês atual): o progresso das metas. */
  realizedOnly?: boolean
}

export type MetricArea = "financial" | "commercial" | "operational"

export const METRIC_AREA_LABEL: Record<MetricArea, string> = {
  financial: "Financeiro",
  commercial: "Comercial",
  operational: "Operacional",
}

export interface DetailRow {
  key: string
  label: string
  sublabel?: string
  value: string
  href?: string
}

export interface MetricDetails {
  rows: DetailRow[]
  /** Linha de rodapé (ex.: a conta que forma o número). */
  note?: string
}

export interface MetricDefinition {
  key: string
  label: string
  area: MetricArea
  unit: MetricUnit
  /** Subir é bom (up), cair é bom (down) ou neutro (null). */
  better: "up" | "down" | null
  /** Fluxo (soma no período) ou estoque (no fim do período). */
  kind: "flow" | "stock" | "ratio"
  /** Como é calculado, em uma frase. */
  formula: string
  /** Aceita filtro por cliente (metas de um cliente). */
  perClient?: boolean
  value: (ctx: MetricContext, range: DateRange) => number | null
  details: (ctx: MetricContext, range: DateRange) => MetricDetails
  /** Tela com os dados de origem. */
  href?: (range: DateRange, ctx: MetricContext) => string
}

/* ------------------------------------------------------------------ */
/* Apoio                                                               */
/* ------------------------------------------------------------------ */

const sum = <T,>(list: T[], value: (item: T) => number) => list.reduce((total, item) => total + value(item), 0)
const within = (day: DateKey | null, range: DateRange) => day !== null && day >= range.start && day <= range.end
const points = (fraction: number | null) => (fraction === null ? null : Math.round(fraction * 1000) / 10)
/** Dia de referência de um indicador de estoque: o fim do período ou hoje. */
const asOf = (ctx: MetricContext, range: DateRange) => (range.end < ctx.today ? range.end : ctx.today)
const months = (range: DateRange) => periodsOf(range)
const lastMonth = (range: DateRange) => periodOf(range.end)

function clientName(ctx: MetricContext, id: string | null): string {
  if (!id) return "Sem cliente"
  return ctx.clients.find((client) => client.id === id)?.name ?? "Cliente"
}

function ledger(range: DateRange, accounts: readonly string[], clientId?: string | null): string {
  const search = new URLSearchParams()
  if (range.start.slice(0, 7) === range.end.slice(0, 7)) search.set("mes", range.start.slice(0, 7))
  else {
    search.set("de", range.start.slice(0, 7))
    search.set("ate", range.end.slice(0, 7))
  }
  if (accounts.length > 0) search.set("conta", accounts.join(","))
  if (clientId) search.set("cliente", clientId)
  return `/financeiro/lancamentos?${search.toString()}`
}

function itemRow(ctx: MetricContext, item: FinanceItem): DetailRow {
  const day = item.paid_on ?? item.due_on
  return {
    key: `${item.key}-${day}`,
    label: item.description,
    sublabel: [clientName(ctx, item.client_id), FINANCE_ACCOUNT_LABEL[item.account], `${item.paid_on ? "pago" : "vence"} ${formatShortDate(day, ctx.today)}`]
      .filter((part) => part !== "Sem cliente")
      .join(" · "),
    value: formatMoney(item.kind === "income" ? item.amount_cents : -item.amount_cents),
  }
}

function dealRow(ctx: MetricContext, deal: Deal, value: string): DetailRow {
  return {
    key: deal.id,
    label: deal.title,
    sublabel: [deal.company ?? (deal.client_id ? clientName(ctx, deal.client_id) : null), DEAL_STAGE_LABEL[deal.stage], LEAD_SOURCE_LABEL[deal.source]]
      .filter(Boolean)
      .join(" · "),
    value,
    href: `/comercial?negocio=${deal.id}`,
  }
}

/** Itens do DRE (receita) de um cliente ou de todos, no período. */
function revenueItems(ctx: MetricContext, range: DateRange): FinanceItem[] {
  return months(range)
    .flatMap((period) => dreItems(ctx.index, period, DRE_LINE_ACCOUNTS.revenue, { realized: ctx.realizedOnly }))
    .filter((item) => ctx.clientId === undefined || ctx.clientId === null || item.client_id === ctx.clientId)
}

function dre(ctx: MetricContext, range: DateRange) {
  return sumDre(months(range).map((period) => dreMonth(ctx.index, period, { realized: ctx.realizedOnly })))
}

/** Receitas vencidas e não recebidas num dia (o que estava em atraso naquele dia). */
function overdueAt(ctx: MetricContext, day: DateKey): FinanceItem[] {
  const { entries, recurrences } = ctx.finance
  const items: FinanceItem[] = []
  for (let period = addPeriods(periodOf(day), -24); period <= periodOf(day); period = addPeriods(period, 1)) {
    for (const item of monthItems(entries, recurrences, period)) {
      if (!REVENUE_ACCOUNTS.includes(item.account) || item.skipped || item.due_on >= day) continue
      if (item.paid_on && item.paid_on <= day) continue
      if (ctx.clientId && item.client_id !== ctx.clientId) continue
      items.push(item)
    }
  }
  return items
}

const completedOn = (task: Task) => (task.completed_at ? toDateKey(task.completed_at) : null)
const scopedTasks = (ctx: MetricContext) => (ctx.clientId ? ctx.tasks.filter((task) => task.client_id === ctx.clientId) : ctx.tasks)
const scopedDeals = (ctx: MetricContext) => (ctx.clientId ? ctx.deals.filter((deal) => deal.client_id === ctx.clientId) : ctx.deals)

function tasksDone(ctx: MetricContext, range: DateRange): Task[] {
  return scopedTasks(ctx).filter((task) => task.status === "done" && within(completedOn(task), range))
}

/** Tarefas abertas e vencidas num dia (as concluídas depois contam como atrasadas naquele dia). */
function tasksOverdueAt(ctx: MetricContext, day: DateKey): Task[] {
  return scopedTasks(ctx).filter((task) => {
    if (!task.due_date || task.due_date >= day || toDateKey(task.created_at) > day) return false
    const done = completedOn(task)
    return task.status !== "done" || (done !== null && done > day)
  })
}

function projectActiveAt(project: Project, day: DateKey): boolean {
  if (project.starts_on > day) return false
  const done = project.completed_at ? toDateKey(project.completed_at) : null
  if (project.status === "done") return done !== null && done > day
  return project.status === "active"
}

const scopedProjects = (ctx: MetricContext) => (ctx.clientId ? ctx.projects.filter((project) => project.client_id === ctx.clientId) : ctx.projects)

/** Revisões mensais que venceram no período e quantas foram feitas. */
function reviewsIn(ctx: MetricContext, range: DateRange) {
  const limit = asOf(ctx, range)
  const rows: { client: ClientDetail; period: DateKey; due: DateKey; done: boolean }[] = []
  for (const period of months(range)) {
    for (const client of ctx.clients) {
      if (!client.active || (ctx.clientId && client.id !== ctx.clientId)) continue
      const due = reviewDue(client, period)
      if (!due || due > limit) continue
      const review = ctx.reviews.find((candidate) => candidate.client_id === client.id && candidate.period === period)
      rows.push({ client, period, due, done: Boolean(review?.done) })
    }
  }
  return rows
}

/** Saúde do cliente num dia: a da revisão mais recente até aquele mês. */
function healthAt(ctx: MetricContext, clientId: string, day: DateKey) {
  return currentHealth(
    clientId,
    ctx.reviews.filter((review) => review.period <= periodOf(day))
  )
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

export const METRICS: MetricDefinition[] = [
  // Financeiro ----------------------------------------------------------
  {
    key: "revenue",
    label: "Faturamento",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "flow",
    formula: "Receita bruta (receitas de cliente + outras receitas) no regime de caixa, como no DRE.",
    perClient: true,
    value: (ctx, range) =>
      ctx.clientId ? sum(revenueItems(ctx, range), (item) => item.amount_cents) : dre(ctx, range).revenue,
    details: (ctx, range) => ({
      rows: revenueItems(ctx, range).map((item) => itemRow(ctx, item)),
      note: "Recebidos no período e, no mês atual e nos futuros, o que ainda vence neles.",
    }),
    href: (range, ctx) => ledger(range, DRE_LINE_ACCOUNTS.revenue, ctx.clientId),
  },
  {
    key: "mrr",
    label: "Receita recorrente (MRR)",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "stock",
    formula: "Soma dos contratos de clientes (receitas recorrentes) que valem no último mês do período.",
    perClient: true,
    value: (ctx, range) => mrr(ctx.index, lastMonth(range), ctx.clientId ?? undefined),
    details: (ctx, range) => ({
      rows: recurringIn(ctx.index, lastMonth(range), "client_revenue", ctx.clientId ?? undefined).map((item) => ({
        key: item.key,
        label: clientName(ctx, item.client_id),
        sublabel: [item.description, item.category].filter(Boolean).join(" · "),
        value: formatMoney(item.amount_cents),
        href: item.client_id ? `/clientes/${item.client_id}` : undefined,
      })),
    }),
    href: () => "/financeiro/contratos",
  },
  {
    key: "active_clients",
    label: "Clientes com contrato",
    area: "financial",
    unit: "count",
    better: "up",
    kind: "stock",
    formula: "Clientes com pelo menos um contrato recorrente valendo no último mês do período.",
    value: (ctx, range) => activeClientIds(ctx.index, lastMonth(range)).size,
    details: (ctx, range) => ({
      rows: [...activeClientIds(ctx.index, lastMonth(range))].map((id) => ({
        key: id,
        label: clientName(ctx, id),
        value: formatMoney(mrr(ctx.index, lastMonth(range), id)),
        href: `/clientes/${id}`,
      })),
    }),
    href: () => "/financeiro/contratos",
  },
  {
    key: "average_ticket",
    label: "Ticket médio por cliente",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "ratio",
    formula: "MRR ÷ clientes com contrato, no último mês do período.",
    value: (ctx, range) => {
      const clients = activeClientIds(ctx.index, lastMonth(range)).size
      return clients > 0 ? Math.round(mrr(ctx.index, lastMonth(range)) / clients) : null
    },
    details: (ctx, range) => ({
      rows: [...activeClientIds(ctx.index, lastMonth(range))].map((id) => ({
        key: id,
        label: clientName(ctx, id),
        value: formatMoney(mrr(ctx.index, lastMonth(range), id)),
        href: `/clientes/${id}`,
      })),
    }),
    href: () => "/financeiro/contratos",
  },
  {
    key: "new_mrr",
    label: "MRR novo",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "flow",
    formula: "Contratos de clientes que começaram no período (mensalidade de cada um).",
    value: (ctx, range) => sum(months(range), (period) => mrrMovement(ctx.index, period).added),
    details: (ctx, range) => ({
      rows: months(range).flatMap((period) =>
        recurringIn(ctx.index, period, "client_revenue")
          .filter((item) => item.recurrence?.starts_on === period)
          .map((item) => ({
            key: item.key,
            label: clientName(ctx, item.client_id),
            sublabel: `${item.description} · desde ${formatShortDate(period, ctx.today)}`,
            value: formatMoney(item.amount_cents),
          }))
      ),
    }),
    href: () => "/financeiro/contratos",
  },
  {
    key: "churned_mrr",
    label: "MRR perdido",
    area: "financial",
    unit: "money",
    better: "down",
    kind: "flow",
    formula: "Contratos de clientes que terminaram no mês anterior a cada mês do período.",
    value: (ctx, range) => sum(months(range), (period) => mrrMovement(ctx.index, period).churned),
    details: (ctx, range) => ({
      rows: months(range).flatMap((period) =>
        recurringIn(ctx.index, addPeriods(period, -1), "client_revenue")
          .filter((item) => item.recurrence?.ends_on === addPeriods(period, -1))
          .map((item) => ({
            key: item.key,
            label: clientName(ctx, item.client_id),
            sublabel: `${item.description} · último mês ${formatShortDate(addPeriods(period, -1), ctx.today)}`,
            value: formatMoney(item.amount_cents),
          }))
      ),
    }),
    href: () => "/financeiro/contratos",
  },
  {
    key: "costs",
    label: "Custos e despesas",
    area: "financial",
    unit: "money",
    better: "down",
    kind: "flow",
    formula: "Imposto (pela alíquota) + taxas + custos diretos + custos fixos + outras despesas, como no DRE.",
    value: (ctx, range) => {
      const total = dre(ctx, range)
      return total.revenue - total.result
    },
    details: (ctx, range) => {
      const total = dre(ctx, range)
      return {
        rows: [
          { key: "tax", label: "Imposto sobre a receita", sublabel: "provisão pela alíquota", value: formatMoney(total.tax) },
          { key: "fees", label: "Taxas do gateway", value: formatMoney(total.fees) },
          { key: "direct", label: "Custos diretos de clientes", value: formatMoney(total.directCosts), href: ledger(range, ["direct_cost"]) },
          { key: "fixed", label: "Custos fixos", value: formatMoney(total.fixedCosts), href: ledger(range, ["fixed_cost"]) },
          { key: "other", label: "Outras despesas", value: formatMoney(total.otherExpenses), href: ledger(range, ["other_expense"]) },
        ],
      }
    },
    href: (range) => ledger(range, ["direct_cost", "fixed_cost", "other_expense"]),
  },
  {
    key: "result",
    label: "Resultado (lucro)",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "flow",
    formula: "Margem de contribuição − custos fixos − outras despesas (resultado do DRE).",
    value: (ctx, range) => dre(ctx, range).result,
    details: (ctx, range) => {
      const total = dre(ctx, range)
      return {
        rows: [
          { key: "revenue", label: "Receita bruta", value: formatMoney(total.revenue), href: ledger(range, DRE_LINE_ACCOUNTS.revenue) },
          { key: "tax", label: "(−) Imposto", value: formatMoney(-total.tax) },
          { key: "fees", label: "(−) Taxas do gateway", value: formatMoney(-total.fees) },
          { key: "direct", label: "(−) Custos diretos", value: formatMoney(-total.directCosts), href: ledger(range, ["direct_cost"]) },
          { key: "contribution", label: "(=) Margem de contribuição", value: formatMoney(total.contribution) },
          { key: "fixed", label: "(−) Custos fixos", value: formatMoney(-total.fixedCosts), href: ledger(range, ["fixed_cost"]) },
          { key: "other", label: "(−) Outras despesas", value: formatMoney(-total.otherExpenses), href: ledger(range, ["other_expense"]) },
          { key: "result", label: "(=) Resultado", value: formatMoney(total.result) },
        ],
      }
    },
    href: () => "/financeiro/dre",
  },
  {
    key: "net_margin",
    label: "Margem líquida",
    area: "financial",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "Resultado ÷ receita bruta do período.",
    value: (ctx, range) => points(dre(ctx, range).margin),
    details: (ctx, range) => {
      const total = dre(ctx, range)
      return {
        rows: [
          { key: "result", label: "Resultado", value: formatMoney(total.result) },
          { key: "revenue", label: "Receita bruta", value: formatMoney(total.revenue) },
        ],
      }
    },
    href: () => "/financeiro/dre",
  },
  {
    key: "contribution_margin",
    label: "Margem de contribuição",
    area: "financial",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "(Receita − imposto − taxas − custos diretos) ÷ receita.",
    value: (ctx, range) => points(dre(ctx, range).contributionMargin),
    details: (ctx, range) => {
      const total = dre(ctx, range)
      return {
        rows: [
          { key: "contribution", label: "Margem de contribuição", value: formatMoney(total.contribution) },
          { key: "revenue", label: "Receita bruta", value: formatMoney(total.revenue) },
        ],
      }
    },
    href: () => "/financeiro/dre",
  },
  {
    key: "receivables_overdue",
    label: "A receber em atraso",
    area: "financial",
    unit: "money",
    better: "down",
    kind: "stock",
    formula: "Receitas vencidas e ainda não recebidas no fim do período (ou hoje).",
    perClient: true,
    value: (ctx, range) => sum(overdueAt(ctx, asOf(ctx, range)), (item) => item.amount_cents),
    details: (ctx, range) => ({ rows: overdueAt(ctx, asOf(ctx, range)).map((item) => itemRow(ctx, item)) }),
    href: (_range, ctx) =>
      `/financeiro/lancamentos?situacao=atrasado&conta=client_revenue,other_revenue${ctx.clientId ? `&cliente=${ctx.clientId}` : ""}`,
  },
  {
    key: "delinquency",
    label: "Inadimplência",
    area: "financial",
    unit: "percent",
    better: "down",
    kind: "ratio",
    formula: "Do que venceu no período, quanto segue sem pagamento hoje (receitas).",
    perClient: true,
    value: (ctx, range) => points(delinquency(ctx.index, range, ctx.clientId ?? undefined).rate),
    details: (ctx, range) => {
      const result = delinquency(ctx.index, range, ctx.clientId ?? undefined)
      return {
        rows: result.items.map((item) => itemRow(ctx, item)),
        note: `${formatMoney(result.unpaid)} sem pagamento de ${formatMoney(result.billed)} que venceram no período.`,
      }
    },
    href: (range) => ledger(range, REVENUE_ACCOUNTS).replace("?", "?situacao=atrasado&"),
  },
  {
    key: "cash_balance",
    label: "Saldo em conta",
    area: "financial",
    unit: "money",
    better: "up",
    kind: "stock",
    formula: "Saldo inicial + entradas − saídas − taxas pagas, até o fim do período (ou hoje).",
    value: (ctx, range) => ledgerBalance(ctx.index, asOf(ctx, range)),
    details: (ctx, range) => {
      const end = asOf(ctx, range)
      const rows: DetailRow[] = [
        { key: "opening", label: "Saldo inicial", sublabel: `em ${formatShortDate(ctx.finance.settings.opening_on, ctx.today)}`, value: formatMoney(ctx.finance.settings.opening_balance_cents) },
      ]
      for (let period = ctx.finance.settings.opening_on; period <= periodOf(end); period = addPeriods(period, 1)) {
        const monthEnd = monthRangeOf(period).end < end ? monthRangeOf(period).end : end
        const before = ledgerBalance(ctx.index, addDaysToKey(period, -1))
        rows.push({
          key: period,
          label: `Movimento de ${formatMonthYear(period).toLocaleLowerCase("pt-BR")}`,
          value: formatMoney(ledgerBalance(ctx.index, monthEnd) - before),
          href: ledger({ start: period, end: monthEnd }, []),
        })
      }
      return { rows, note: "Pelos lançamentos pagos; o fechamento do mês confere com o extrato." }
    },
    href: () => "/financeiro/fechamento",
  },
  {
    key: "cash_months",
    label: "Caixa em meses de custo fixo",
    area: "financial",
    unit: "number",
    better: "up",
    kind: "ratio",
    formula: "Saldo em conta ÷ custos fixos mensais (a meta da planilha é 3 meses).",
    value: (ctx, range) => {
      const fixed = fixedCostsMonthly(ctx.index, lastMonth(range))
      return fixed > 0 ? Math.round((ledgerBalance(ctx.index, asOf(ctx, range)) / fixed) * 10) / 10 : null
    },
    details: (ctx, range) => ({
      rows: [
        { key: "balance", label: "Saldo em conta", value: formatMoney(ledgerBalance(ctx.index, asOf(ctx, range))) },
        { key: "fixed", label: "Custos fixos por mês", value: formatMoney(fixedCostsMonthly(ctx.index, lastMonth(range))), href: "/financeiro/contratos" },
      ],
    }),
    href: () => "/financeiro/projecao",
  },
  {
    key: "required_revenue_gap",
    label: "Falta para a receita necessária",
    area: "financial",
    unit: "money",
    better: "down",
    kind: "stock",
    formula: "Receita mensal necessária para o alvo de pró-labore − MRR de hoje.",
    value: (ctx) => requiredRevenue(ctx.index).gap,
    details: (ctx) => {
      const needed = requiredRevenue(ctx.index)
      return {
        rows: [
          { key: "required", label: "Receita mensal necessária", value: needed.required === null ? "—" : formatMoney(needed.required) },
          { key: "mrr", label: "MRR atual", value: formatMoney(needed.mrr) },
          { key: "owners", label: "Pró-labore alvo (todos os sócios)", value: formatMoney(needed.ownerTarget) },
          { key: "fixed", label: "Custos fixos por mês", value: formatMoney(needed.fixedMonthly) },
        ],
        note: "Calculado com os parâmetros de hoje (não muda com o período).",
      }
    },
    href: () => "/financeiro/projecao",
  },

  // Comercial -----------------------------------------------------------
  {
    key: "leads",
    label: "Leads novos",
    area: "commercial",
    unit: "count",
    better: "up",
    kind: "flow",
    formula: "Negócios que chegaram no período (data de chegada).",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).leads.length,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).leads.map((deal) => dealRow(ctx, deal, formatShortDate(deal.opened_on, ctx.today))),
    }),
    href: () => "/comercial",
  },
  {
    key: "proposals",
    label: "Propostas enviadas",
    area: "commercial",
    unit: "count",
    better: "up",
    kind: "flow",
    formula: "Negócios que chegaram à etapa de proposta no período.",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).proposals.length,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).proposals.map((deal) => dealRow(ctx, deal, formatShortDate(deal.proposal_sent_on!, ctx.today))),
    }),
    href: () => "/comercial",
  },
  {
    key: "deals_won",
    label: "Negócios ganhos",
    area: "commercial",
    unit: "count",
    better: "up",
    kind: "flow",
    formula: "Negócios marcados como ganhos no período.",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).won.length,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).won.map((deal) => dealRow(ctx, deal, formatMoney(contractValue(deal)))),
    }),
    href: () => "/comercial",
  },
  {
    key: "win_rate",
    label: "Taxa de ganho",
    area: "commercial",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "Ganhos ÷ (ganhos + perdidos) fechados no período.",
    value: (ctx, range) => points(salesStats(scopedDeals(ctx), range).winRate),
    details: (ctx, range) => {
      const stats = salesStats(scopedDeals(ctx), range)
      return {
        rows: [...stats.won, ...stats.lost].map((deal) =>
          dealRow(ctx, deal, deal.stage === "won" ? "Ganho" : `Perdido${deal.lost_reason ? ` · ${deal.lost_reason}` : ""}`)
        ),
      }
    },
    href: () => "/comercial",
  },
  {
    key: "lead_conversion",
    label: "Conversão de leads",
    area: "commercial",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "Dos leads que chegaram no período, quantos viraram cliente (ganhos até hoje).",
    value: (ctx, range) => points(salesStats(scopedDeals(ctx), range).leadConversion),
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).leads.map((deal) => dealRow(ctx, deal, DEAL_STAGE_LABEL[deal.stage])),
    }),
    href: () => "/comercial",
  },
  {
    key: "won_mrr",
    label: "MRR vendido",
    area: "commercial",
    unit: "money",
    better: "up",
    kind: "flow",
    formula: "Soma do valor mensal dos negócios ganhos no período.",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).wonRecurring,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range)
        .won.filter((deal) => deal.recurring_cents > 0)
        .map((deal) => dealRow(ctx, deal, formatMoney(deal.recurring_cents))),
    }),
    href: () => "/comercial",
  },
  {
    key: "won_value",
    label: "Valor vendido",
    area: "commercial",
    unit: "money",
    better: "up",
    kind: "flow",
    formula: "Valor total dos contratos ganhos no período (pontual + mensal × meses; sem prazo, 12 meses).",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).wonValue,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).won.map((deal) => dealRow(ctx, deal, formatMoney(contractValue(deal)))),
    }),
    href: () => "/comercial",
  },
  {
    key: "average_deal",
    label: "Ticket médio de venda",
    area: "commercial",
    unit: "money",
    better: "up",
    kind: "ratio",
    formula: "Valor vendido ÷ negócios ganhos no período.",
    value: (ctx, range) => salesStats(scopedDeals(ctx), range).averageTicket,
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).won.map((deal) => dealRow(ctx, deal, formatMoney(contractValue(deal)))),
    }),
    href: () => "/comercial",
  },
  {
    key: "sales_cycle",
    label: "Ciclo de venda",
    area: "commercial",
    unit: "days",
    better: "down",
    kind: "ratio",
    formula: "Média de dias entre a chegada do lead e o ganho, dos ganhos no período.",
    value: (ctx, range) => {
      const days = salesStats(scopedDeals(ctx), range).cycleDays
      return days === null ? null : Math.round(days * 10) / 10
    },
    details: (ctx, range) => ({
      rows: salesStats(scopedDeals(ctx), range).won.map((deal) =>
        dealRow(ctx, deal, `${Math.max(0, daysBetween(deal.opened_on, deal.closed_on ?? deal.opened_on))} dias`)
      ),
    }),
    href: () => "/comercial",
  },
  {
    key: "pipeline_weighted",
    label: "Funil ponderado",
    area: "commercial",
    unit: "money",
    better: "up",
    kind: "stock",
    formula: "Negócios em aberto no fim do período: valor do contrato × chance de fechar.",
    value: (ctx, range) => {
      const day = asOf(ctx, range)
      return sum(openAt(ctx, day), weightedValue)
    },
    details: (ctx, range) => ({
      rows: openAt(ctx, asOf(ctx, range)).map((deal) =>
        dealRow(ctx, deal, `${formatMoney(weightedValue(deal))} (${probabilityOf(deal)}%)`)
      ),
      note: "Usa a etapa e a chance de hoje de cada negócio.",
    }),
    href: () => "/comercial",
  },

  // Operacional ---------------------------------------------------------
  {
    key: "tasks_done",
    label: "Tarefas concluídas",
    area: "operational",
    unit: "count",
    better: "up",
    kind: "flow",
    formula: "Tarefas concluídas no período.",
    perClient: true,
    value: (ctx, range) => tasksDone(ctx, range).length,
    details: (ctx, range) => ({
      rows: tasksDone(ctx, range).map((task) => ({
        key: task.id,
        label: task.title,
        sublabel: task.client_id ? clientName(ctx, task.client_id) : undefined,
        value: formatShortDate(completedOn(task)!, ctx.today),
      })),
    }),
    href: (_range, ctx) => `/tarefas?status=done${ctx.clientId ? `&cliente=${ctx.clientId}` : ""}`,
  },
  {
    key: "on_time_rate",
    label: "Entregas no prazo",
    area: "operational",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "Das tarefas com prazo concluídas no período, quantas foram concluídas até o prazo.",
    perClient: true,
    value: (ctx, range) => {
      const withDue = tasksDone(ctx, range).filter((task) => task.due_date)
      return withDue.length > 0 ? points(withDue.filter((task) => completedOn(task)! <= task.due_date!).length / withDue.length) : null
    },
    details: (ctx, range) => ({
      rows: tasksDone(ctx, range)
        .filter((task) => task.due_date)
        .map((task) => {
          const late = completedOn(task)! > task.due_date!
          return {
            key: task.id,
            label: task.title,
            sublabel: `prazo ${formatShortDate(task.due_date!, ctx.today)} · feita ${formatShortDate(completedOn(task)!, ctx.today)}`,
            value: late ? `${daysBetween(task.due_date!, completedOn(task)!)} dias depois` : "No prazo",
          }
        }),
    }),
    href: () => "/tarefas",
  },
  {
    key: "tasks_overdue",
    label: "Tarefas atrasadas",
    area: "operational",
    unit: "count",
    better: "down",
    kind: "stock",
    formula: "Tarefas abertas com prazo vencido no fim do período (ou hoje).",
    perClient: true,
    value: (ctx, range) => tasksOverdueAt(ctx, asOf(ctx, range)).length,
    details: (ctx, range) => ({
      rows: tasksOverdueAt(ctx, asOf(ctx, range)).map((task) => ({
        key: task.id,
        label: task.title,
        sublabel: task.client_id ? clientName(ctx, task.client_id) : undefined,
        value: `venceu ${formatShortDate(task.due_date!, ctx.today)}`,
      })),
    }),
    href: (_range, ctx) => `/tarefas?prazo=overdue${ctx.clientId ? `&cliente=${ctx.clientId}` : ""}`,
  },
  {
    key: "projects_active",
    label: "Projetos ativos",
    area: "operational",
    unit: "count",
    better: null,
    kind: "stock",
    formula: "Projetos em andamento no fim do período.",
    perClient: true,
    value: (ctx, range) => scopedProjects(ctx).filter((project) => projectActiveAt(project, asOf(ctx, range))).length,
    details: (ctx, range) => ({
      rows: scopedProjects(ctx)
        .filter((project) => projectActiveAt(project, asOf(ctx, range)))
        .map((project) => ({
          key: project.id,
          label: project.name,
          sublabel: project.client_id ? clientName(ctx, project.client_id) : "Interno",
          value: project.due_on ? `prazo ${formatShortDate(project.due_on, ctx.today)}` : PROJECT_STATUS_LABEL[project.status],
          href: `/projetos/${project.id}`,
        })),
    }),
    href: () => "/projetos",
  },
  {
    key: "projects_late",
    label: "Projetos atrasados",
    area: "operational",
    unit: "count",
    better: "down",
    kind: "stock",
    formula: "Projetos em andamento com o prazo vencido no fim do período (ou hoje).",
    perClient: true,
    value: (ctx, range) => {
      const day = asOf(ctx, range)
      return scopedProjects(ctx).filter((project) => projectActiveAt(project, day) && project.due_on !== null && project.due_on < day).length
    },
    details: (ctx, range) => {
      const day = asOf(ctx, range)
      return {
        rows: scopedProjects(ctx)
          .filter((project) => projectActiveAt(project, day) && project.due_on !== null && project.due_on < day)
          .map((project) => ({
            key: project.id,
            label: project.name,
            sublabel: project.client_id ? clientName(ctx, project.client_id) : "Interno",
            value: `prazo ${formatShortDate(project.due_on!, ctx.today)}`,
            href: `/projetos/${project.id}`,
          })),
      }
    },
    href: () => "/projetos",
  },
  {
    key: "projects_done",
    label: "Projetos concluídos",
    area: "operational",
    unit: "count",
    better: "up",
    kind: "flow",
    formula: "Projetos concluídos no período.",
    perClient: true,
    value: (ctx, range) =>
      scopedProjects(ctx).filter((project) => project.status === "done" && project.completed_at && within(toDateKey(project.completed_at), range)).length,
    details: (ctx, range) => ({
      rows: scopedProjects(ctx)
        .filter((project) => project.status === "done" && project.completed_at && within(toDateKey(project.completed_at), range))
        .map((project) => ({
          key: project.id,
          label: project.name,
          sublabel: project.client_id ? clientName(ctx, project.client_id) : "Interno",
          value: formatShortDate(toDateKey(project.completed_at!), ctx.today),
          href: `/projetos/${project.id}`,
        })),
    }),
    href: () => "/projetos",
  },
  {
    key: "reviews_on_time",
    label: "Revisões de clientes feitas",
    area: "operational",
    unit: "percent",
    better: "up",
    kind: "ratio",
    formula: "Das revisões mensais que venceram no período, quantas foram concluídas.",
    perClient: true,
    value: (ctx, range) => {
      const rows = reviewsIn(ctx, range)
      return rows.length > 0 ? points(rows.filter((row) => row.done).length / rows.length) : null
    },
    details: (ctx, range) => ({
      rows: reviewsIn(ctx, range).map((row) => ({
        key: `${row.client.id}-${row.period}`,
        label: row.client.name,
        sublabel: `revisão de ${formatShortDate(row.period, ctx.today).slice(3)} · vence ${formatShortDate(row.due, ctx.today)}`,
        value: row.done ? "Feita" : "Pendente",
        href: `/clientes/${row.client.id}`,
      })),
    }),
    href: () => "/clientes",
  },
  {
    key: "clients_at_risk",
    label: "Clientes em risco",
    area: "operational",
    unit: "count",
    better: "down",
    kind: "stock",
    formula: "Clientes ativos com saúde “em risco” na revisão mais recente até o fim do período.",
    value: (ctx, range) =>
      ctx.clients.filter((client) => client.active && healthAt(ctx, client.id, asOf(ctx, range))?.health === "at_risk").length,
    details: (ctx, range) => ({
      rows: ctx.clients
        .filter((client) => client.active && healthAt(ctx, client.id, asOf(ctx, range))?.health === "at_risk")
        .map((client) => ({ key: client.id, label: client.name, value: "Em risco", href: `/clientes/${client.id}` })),
    }),
    href: () => "/clientes",
  },
]

/** Negócios em aberto num dia (chegaram até ele e não tinham fechado). */
function openAt(ctx: MetricContext, day: DateKey): Deal[] {
  return scopedDeals(ctx).filter(
    (deal) => deal.opened_on <= day && (isOpenDeal(deal) ? true : deal.closed_on !== null && deal.closed_on > day)
  )
}

export const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]))

export function isMetricKey(value: unknown): value is string {
  return typeof value === "string" && METRIC_BY_KEY.has(value)
}

export function metricsOf(area: MetricArea): MetricDefinition[] {
  return METRICS.filter((metric) => metric.area === area)
}
