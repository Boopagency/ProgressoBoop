import { periodLabel } from "@/features/clients/logic"
import { contractValue, isOpenDeal, probabilityOf } from "@/features/deals/logic"
import { filterLedger, ledgerStatusOf, type LedgerFilters } from "@/features/finance/ledger-filters"
import {
  allocation,
  clientMargins,
  DRE_LINES,
  dreMonth,
  entryIssues,
  ledgerItems,
  periodsOf,
  projection,
  recurrenceSummary,
  type DreStatus,
} from "@/features/finance/management"
import { GOAL_STATE_LABEL } from "@/features/goals/logic"
import type { ObjectiveView } from "@/features/goals/view-model"
import { METRIC_AREA_LABEL, METRICS, type MetricContext } from "@/features/metrics/catalog"
import { comparisonOf, type CompareMode, type MetricPeriod } from "@/features/metrics/periods"
import { REPORT_SECTION_LABEL, type ReportSection } from "@/features/reports/sections"
import { firstName } from "@/features/tasks/logic"
import { daysBetween, monthRangeOf, toDateKey } from "@/lib/dates"
import {
  DEAL_STAGE_LABEL,
  FINANCE_ACCOUNT_LABEL,
  FINANCE_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  PROJECT_STATUS_LABEL,
} from "@/lib/labels"
import type { DateKey, MetricUnit, Profile } from "@/lib/types"
import { columnLetter, firstDataRow, type Cell, type CellInput, type Sheet } from "@/lib/xlsx"

/*
 * Abas do Excel de um relatório. Os valores vêm das mesmas funções das
 * telas; linhas calculadas (margens, resultado, totais, ponderado) vão como
 * fórmulas, com o resultado já preenchido.
 */

export interface ReportInput {
  ctx: MetricContext
  period: MetricPeriod
  compare: CompareMode
  sections: ReportSection[]
  /** Meses do DRE (dia 1). */
  dreMonths: DateKey[]
  ledger: LedgerFilters
  profiles: Profile[]
  goals: ObjectiveView[]
  generatedBy: string
  generatedAt: string
}

const reais = (cents: number) => Math.round(cents) / 100
const DRE_STATUS_TEXT: Record<DreStatus, string> = { closed: "Fechado", realized: "Realizado", current: "Parcial", forecast: "Previsto" }
const shortMonth = (period: DateKey) => periodLabel(period).slice(0, 3).toLocaleLowerCase("pt-BR") + "/" + period.slice(2, 4)

/** Valor de indicador na unidade do Excel (dinheiro em reais, percentual em fração). */
function metricCell(value: number | null, unit: MetricUnit): Cell {
  if (value === null) return { value: null }
  if (unit === "money") return { value: reais(value), format: "money" }
  if (unit === "percent") return { value: value / 100, format: "percent" }
  return { value, format: unit === "count" ? "integer" : "decimal" }
}

function clientName(ctx: MetricContext, id: string | null): string {
  return id ? (ctx.clients.find((client) => client.id === id)?.name ?? "") : ""
}

/* ------------------------------------------------------------------ */
/* Premissas e sobre                                                   */
/* ------------------------------------------------------------------ */

/** Linha da alíquota na aba Premissas (o DRE calcula o imposto por ela). */
const TAX_CELL = "Premissas!$B$2"

function premissasSheet(ctx: MetricContext): Sheet {
  const { settings } = ctx.finance
  return {
    name: "Premissas",
    columns: [
      { header: "Parâmetro", width: 42 },
      { header: "Valor", width: 16 },
      { header: "Observação", width: 70 },
    ],
    rows: [
      [
        "Alíquota de imposto sobre a receita bruta",
        { value: settings.tax_rate_bps / 10000, format: "percent", input: true },
        settings.tax_rate_confirmed ? "Confirmada com o contador." : "Premissa a confirmar com o contador (Simples Nacional, anexo III ou V / Fator R).",
      ],
      ["Taxa média do gateway (Asaas)", { value: ctx.index.gatewayRate, format: "percent" }, "Calculada: taxas ÷ valor bruto das receitas de cliente dos últimos 12 meses."],
      ["Caixa mínimo (meses de custo fixo)", { value: settings.reserve_months, format: "integer", input: true }, ""],
      ["% do resultado para o caixa", { value: settings.reserve_share_bps / 10000, format: "percent", input: true }, "Depois que o caixa mínimo foi atingido."],
      ["% do resultado para reinvestimento", { value: settings.reinvest_share_bps / 10000, format: "percent", input: true }, "Depois que o caixa mínimo foi atingido."],
      [
        "% do resultado para pró-labore",
        { value: 1 - (settings.reserve_share_bps + settings.reinvest_share_bps) / 10000, format: "percent", formula: "1-B5-B6" },
        "O que sobra, dividido igualmente entre os sócios.",
      ],
      ["Número de sócios", { value: settings.partners, format: "integer", input: true }, ""],
      ["Alvo de pró-labore por sócio (mensal)", { value: reais(settings.owner_draw_target_cents), format: "money", input: true }, "Usado no cálculo da receita necessária."],
      ["Saldo em conta no início", { value: reais(settings.opening_balance_cents), format: "money", input: true }, ""],
      ["Primeiro mês do controle", { value: settings.opening_on, format: "date", input: true }, ""],
    ],
    notes: ["Valores em azul são premissas (vêm dos Parâmetros do financeiro). Mudar a alíquota aqui recalcula o imposto e o resultado da aba DRE."],
  }
}

function aboutSheet(input: ReportInput): Sheet {
  const comparison = comparisonOf(input.period, input.compare)
  return {
    name: "Sobre",
    intro: ["Boop — relatório de gestão", `${input.period.label} · gerado em ${input.generatedAt} por ${input.generatedBy}`],
    columns: [
      { header: "Item", width: 30 },
      { header: "Detalhe", width: 100 },
    ],
    rows: [
      ["Período", input.period.label],
      ["Comparação", comparison.label],
      ["Abas", input.sections.map((section) => REPORT_SECTION_LABEL[section]).join(", ")],
      ["Critério financeiro", "Regime de caixa, como na planilha: o que foi recebido e pago em cada mês; no mês atual e nos futuros, também o que ainda vence neles."],
      ["Imposto", "Provisão pela alíquota da aba Premissas sobre a receita bruta (o DAS pago fica fora do resultado)."],
      ["Origem", "Calculado pelo Boop Admin a partir dos lançamentos, contratos, negócios, tarefas e projetos. Nada digitado à mão."],
    ],
  }
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

function indicatorsSheet(input: ReportInput): Sheet {
  const { ctx, period } = input
  const comparison = comparisonOf(period, input.compare)
  const intro = [`Indicadores — ${period.label}`, `Comparação: ${comparison.label}. Percentuais: a variação é em pontos percentuais.`]
  const start = firstDataRow({ intro })
  const rows: CellInput[][] = METRICS.map((metric, index) => {
    const row = start + index
    const value = metric.value(ctx, period.range)
    const previous = metric.value(ctx, comparison.range)
    const current = metricCell(value, metric.unit)
    const before = metricCell(previous, metric.unit)
    const variation: Cell =
      value === null || previous === null
        ? { value: null }
        : metric.unit === "percent"
          ? { value: (value - previous) / 100, format: "percent", formula: `C${row}-D${row}` }
          : previous === 0
            ? { value: null }
            : { value: value / previous - 1, format: "percent", formula: `IFERROR(C${row}/D${row}-1,"")` }
    return [METRIC_AREA_LABEL[metric.area], metric.label, current, before, variation, metric.formula]
  })
  return {
    name: "Indicadores",
    intro,
    columns: [
      { header: "Área", width: 13 },
      { header: "Indicador", width: 32 },
      { header: period.short, width: 16 },
      { header: comparison.short, width: 16 },
      { header: "Variação", width: 11 },
      { header: "Como é calculado", width: 90 },
    ],
    rows,
  }
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

function dreSheet(input: ReportInput): Sheet {
  const { ctx } = input
  const months = input.dreMonths.map((period) => dreMonth(ctx.index, period))
  const intro = [`DRE mensal — ${periodLabel(input.dreMonths[0]!)} a ${periodLabel(input.dreMonths[input.dreMonths.length - 1]!).toLocaleLowerCase("pt-BR")}`, "Situação: Fechado (conferido), Realizado, Parcial (mês atual) ou Previsto."]
  const start = firstDataRow({ intro })
  const count = months.length
  const totalColumn = columnLetter(count + 1)
  // Linha de cada item (para as fórmulas).
  const ROW = {
    status: start,
    revenue: start + 1,
    tax: start + 2,
    fees: start + 3,
    direct: start + 4,
    contribution: start + 5,
    fixed: start + 6,
    other: start + 7,
    result: start + 8,
    margin: start + 9,
    contributionMargin: start + 10,
    outside: start + 11,
    contributions: start + 12,
    taxPaid: start + 13,
    draws: start + 14,
    reinvest: start + 15,
  }
  const col = (index: number) => columnLetter(index + 1)
  const money = (value: number, formula?: string, bold = false): Cell => ({ value: reais(value), format: "money", formula, bold })
  const sumRow = (row: number, bold = false): Cell => ({
    value: null,
    format: "money",
    formula: `SUM(B${row}:${col(count - 1)}${row})`,
    bold,
  })
  const line = (label: string, values: Cell[], total: Cell): CellInput[] => [label, ...values, total]
  const totals = {
    revenue: months.reduce((sum, month) => sum + month.revenue, 0),
    tax: months.reduce((sum, month) => sum + month.tax, 0),
    fees: months.reduce((sum, month) => sum + month.fees, 0),
    direct: months.reduce((sum, month) => sum + month.directCosts, 0),
    contribution: months.reduce((sum, month) => sum + month.contribution, 0),
    fixed: months.reduce((sum, month) => sum + month.fixedCosts, 0),
    other: months.reduce((sum, month) => sum + month.otherExpenses, 0),
    result: months.reduce((sum, month) => sum + month.result, 0),
  }
  const withTotal = (cell: Cell, value: number): Cell => ({ ...cell, value: reais(value) })
  const rows: CellInput[][] = [
    ["Situação", ...months.map((month) => DRE_STATUS_TEXT[month.status]), ""],
    line(DRE_LINES[0].label, months.map((month) => money(month.revenue, undefined, true)), withTotal(sumRow(ROW.revenue, true), totals.revenue)),
    line(
      DRE_LINES[1].label,
      months.map((month, index) => money(-month.tax, `-${col(index)}${ROW.revenue}*${TAX_CELL}`)),
      withTotal(sumRow(ROW.tax), -totals.tax)
    ),
    line(DRE_LINES[2].label, months.map((month) => money(-month.fees)), withTotal(sumRow(ROW.fees), -totals.fees)),
    line(DRE_LINES[3].label, months.map((month) => money(-month.directCosts)), withTotal(sumRow(ROW.direct), -totals.direct)),
    line(
      DRE_LINES[4].label,
      months.map((month, index) => money(month.contribution, `SUM(${col(index)}${ROW.revenue}:${col(index)}${ROW.direct})`, true)),
      withTotal(sumRow(ROW.contribution, true), totals.contribution)
    ),
    line(DRE_LINES[5].label, months.map((month) => money(-month.fixedCosts)), withTotal(sumRow(ROW.fixed), -totals.fixed)),
    line(DRE_LINES[6].label, months.map((month) => money(-month.otherExpenses)), withTotal(sumRow(ROW.other), -totals.other)),
    line(
      DRE_LINES[7].label,
      months.map((month, index) => money(month.result, `${col(index)}${ROW.contribution}+${col(index)}${ROW.fixed}+${col(index)}${ROW.other}`, true)),
      withTotal(sumRow(ROW.result, true), totals.result)
    ),
    [
      "Margem líquida (%)",
      ...months.map((month, index) => ({
        value: month.margin,
        format: "percent" as const,
        formula: `IFERROR(${col(index)}${ROW.result}/${col(index)}${ROW.revenue},"")`,
      })),
      { value: totals.revenue > 0 ? totals.result / totals.revenue : null, format: "percent", formula: `IFERROR(${totalColumn}${ROW.result}/${totalColumn}${ROW.revenue},"")`, bold: true },
    ],
    [
      "Margem de contribuição (%)",
      ...months.map((month, index) => ({
        value: month.contributionMargin,
        format: "percent" as const,
        formula: `IFERROR(${col(index)}${ROW.contribution}/${col(index)}${ROW.revenue},"")`,
      })),
      {
        value: totals.revenue > 0 ? totals.contribution / totals.revenue : null,
        format: "percent",
        formula: `IFERROR(${totalColumn}${ROW.contribution}/${totalColumn}${ROW.revenue},"")`,
        bold: true,
      },
    ],
    ["Fora do resultado (só caixa)"],
    line("Aportes de sócios", months.map((month) => money(month.ownerContributions)), withTotal(sumRow(ROW.contributions), months.reduce((sum, month) => sum + month.ownerContributions, 0))),
    line("Imposto (DAS)", months.map((month) => money(-month.taxPaid)), withTotal(sumRow(ROW.taxPaid), -months.reduce((sum, month) => sum + month.taxPaid, 0))),
    line("Pró-labore", months.map((month) => money(-month.ownerDraws)), withTotal(sumRow(ROW.draws), -months.reduce((sum, month) => sum + month.ownerDraws, 0))),
    line("Reinvestimentos", months.map((month) => money(-month.reinvestments)), withTotal(sumRow(ROW.reinvest), -months.reduce((sum, month) => sum + month.reinvestments, 0))),
  ]
  return {
    name: "DRE",
    intro,
    columns: [{ header: "Linha", width: 34 }, ...months.map((month) => ({ header: shortMonth(month.period), width: 14 })), { header: "Total", width: 15 }],
    rows,
    notes: ["Imposto = receita bruta × alíquota (aba Premissas). Taxas: as cobradas (realizado) ou a taxa média sobre a receita prevista."],
  }
}

/* ------------------------------------------------------------------ */
/* Projeção e divisão do resultado                                     */
/* ------------------------------------------------------------------ */

const RULE_TEXT = { negative: "Negativo (o caixa cobre)", building: "Formando caixa", split: "Dividindo" } as const

function projectionSheet(input: ReportInput): Sheet {
  const { ctx } = input
  const months = projection(ctx.index, 12)
  const shares = allocation(ctx.index, ctx.index.current, months[months.length - 1]!.period)
  const intro = ["Projeção de 12 meses e divisão do resultado", "Mantidos os contratos, custos fixos e lançamentos agendados de hoje."]
  return {
    name: "Projeção",
    intro,
    columns: [
      { header: "Mês", width: 16 },
      { header: "Situação", width: 11 },
      { header: "Contratos", width: 10, format: "integer" },
      { header: "MRR", width: 14, format: "money" },
      { header: "Receita", width: 14, format: "money" },
      { header: "Resultado", width: 14, format: "money" },
      { header: "Regra", width: 22 },
      { header: "Para o caixa", width: 14, format: "money" },
      { header: "Reinvestimento", width: 14, format: "money" },
      { header: "Pró-labore", width: 14, format: "money" },
      { header: "Por sócio", width: 13, format: "money" },
      { header: "Caixa no fim", width: 14, format: "money" },
      { header: "Contratos que acabam", width: 40 },
    ],
    rows: months.map((month, index) => {
      const share = shares[index]
      return [
        periodLabel(month.period),
        DRE_STATUS_TEXT[month.dre.status],
        month.contracts,
        reais(month.mrr),
        reais(month.dre.revenue),
        reais(month.dre.result),
        share ? RULE_TEXT[share.rule] : "",
        share ? reais(share.toReserve - share.deficit) : null,
        share ? reais(share.toReinvest) : null,
        share ? reais(share.toOwners) : null,
        share ? reais(share.perPartner) : null,
        share ? reais(share.reserveEnd) : null,
        month.ending.map((recurrence) => recurrence.description).join(", "),
      ]
    }),
  }
}

/* ------------------------------------------------------------------ */
/* Contratos e recorrências                                            */
/* ------------------------------------------------------------------ */

function contractsSheet(input: ReportInput): Sheet {
  const { ctx } = input
  const margins = clientMargins(ctx.index)
  const intro = [`Margem por cliente — ${periodLabel(ctx.index.current)}`, "Margem = MRR − imposto e taxa − custos diretos do cliente."]
  const start = firstDataRow({ intro })
  const end = start + margins.length - 1
  return {
    name: "Contratos",
    intro,
    columns: [
      { header: "Cliente", width: 28 },
      { header: "Frentes", width: 28 },
      { header: "MRR", width: 14, format: "money" },
      { header: "Imposto e taxa", width: 14, format: "money" },
      { header: "Custos diretos", width: 14, format: "money" },
      { header: "Margem", width: 14, format: "money" },
      { header: "Margem (%)", width: 11, format: "percent" },
      { header: "Fim do contrato", width: 15, format: "date" },
      { header: "Dias até o fim", width: 13, format: "integer" },
    ],
    rows: margins.map((margin, index) => {
      const row = start + index
      return [
        clientName(ctx, margin.clientId),
        margin.services.join(", "),
        reais(margin.mrr),
        reais(margin.deductions),
        reais(margin.directCosts),
        { value: reais(margin.margin), formula: `C${row}-D${row}-E${row}` },
        { value: margin.marginRate, formula: `IFERROR(F${row}/C${row},"")` },
        margin.contractEnd,
        margin.daysToEnd,
      ]
    }),
    totals:
      margins.length > 0
        ? [
            "Total",
            "",
            { value: reais(margins.reduce((sum, margin) => sum + margin.mrr, 0)), formula: `SUM(C${start}:C${end})` },
            { value: reais(margins.reduce((sum, margin) => sum + margin.deductions, 0)), formula: `SUM(D${start}:D${end})` },
            { value: reais(margins.reduce((sum, margin) => sum + margin.directCosts, 0)), formula: `SUM(E${start}:E${end})` },
            { value: reais(margins.reduce((sum, margin) => sum + margin.margin, 0)), formula: `SUM(F${start}:F${end})` },
            { value: null, formula: `IFERROR(F${end + 1}/C${end + 1},"")` },
            null,
            null,
          ]
        : undefined,
  }
}

const RECURRENCE_STATE = { active: "Ativa", future: "Futura", ended: "Encerrada" } as const

function recurrencesSheet(input: ReportInput): Sheet {
  const { ctx } = input
  const summaries = ctx.finance.recurrences.map((recurrence) => recurrenceSummary(ctx.index, recurrence))
  return {
    name: "Recorrências",
    columns: [
      { header: "Descrição", width: 34 },
      { header: "Tipo", width: 10 },
      { header: "Categoria", width: 24 },
      { header: "Subcategoria / frente", width: 22 },
      { header: "Cliente", width: 22 },
      { header: "Valor por mês", width: 14, format: "money" },
      { header: "Dia", width: 6, format: "integer" },
      { header: "Primeiro mês", width: 13, format: "date" },
      { header: "Último mês", width: 13, format: "date" },
      { header: "Situação", width: 11 },
      { header: "Parcelas restantes", width: 12, format: "integer" },
      { header: "Valor restante", width: 14, format: "money" },
    ],
    rows: summaries.map((summary) => [
      summary.recurrence.description,
      FINANCE_KIND_LABEL[summary.recurrence.kind],
      FINANCE_ACCOUNT_LABEL[summary.recurrence.account],
      summary.recurrence.category ?? "",
      clientName(ctx, summary.recurrence.client_id),
      reais(summary.recurrence.amount_cents),
      summary.recurrence.day_of_month,
      summary.recurrence.starts_on,
      summary.recurrence.ends_on,
      RECURRENCE_STATE[summary.state],
      summary.remaining,
      summary.remainingTotal === null ? null : reais(summary.remainingTotal),
    ]),
  }
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

const LEDGER_STATUS_TEXT = { paid: "Pago", open: "A vencer", overdue: "Vencido", skipped: "Pulado" } as const

function ledgerSheet(input: ReportInput): Sheet {
  const { ctx, ledger } = input
  const periods = periodsOf({ start: ledger.from, end: monthRangeOf(ledger.to).end })
  const items = filterLedger(ledgerItems(ctx.index, periods), ledger, ctx.today, "", () => "")
  const label = ledger.from === ledger.to ? periodLabel(ledger.from) : `${periodLabel(ledger.from)} a ${periodLabel(ledger.to).toLocaleLowerCase("pt-BR")}`
  const intro = [`Lançamentos — ${label}`, "Cada lançamento aparece no mês em que foi pago; o que está em aberto, no mês do vencimento. Saídas com sinal negativo."]
  const start = firstDataRow({ intro })
  const end = start + items.length - 1
  const paid = items.filter((item) => item.paid_on && !item.skipped)
  const net = paid.reduce((sum, item) => sum + (item.kind === "income" ? item.amount_cents : -item.amount_cents) - item.fee_cents, 0)
  return {
    name: "Lançamentos",
    intro,
    columns: [
      { header: "Data", width: 12, format: "date" },
      { header: "Situação", width: 10 },
      { header: "Tipo", width: 9 },
      { header: "Categoria", width: 24 },
      { header: "Subcategoria / frente", width: 20 },
      { header: "Descrição", width: 36 },
      { header: "Cliente", width: 20 },
      { header: "Valor", width: 14, format: "money" },
      { header: "Taxa", width: 11, format: "money" },
      { header: "Líquido", width: 14, format: "money" },
      { header: "Vencimento", width: 12, format: "date" },
      { header: "Conferência", width: 30 },
    ],
    rows: items.map((item, index) => {
      const row = start + index
      const signed = item.kind === "income" ? item.amount_cents : -item.amount_cents
      return [
        item.paid_on ?? item.due_on,
        item.kind === "income" && item.paid_on ? "Recebido" : LEDGER_STATUS_TEXT[ledgerStatusOf(item, ctx.today)],
        FINANCE_KIND_LABEL[item.kind],
        FINANCE_ACCOUNT_LABEL[item.account],
        item.category ?? "",
        item.description,
        clientName(ctx, item.client_id),
        reais(signed),
        reais(item.fee_cents),
        { value: reais(signed - item.fee_cents), formula: `H${row}-I${row}` },
        item.due_on,
        item.entry ? entryIssues(item.entry).join("; ") : "",
      ]
    }),
    totals:
      items.length > 0
        ? [
            "Total",
            "",
            "",
            "",
            "",
            "",
            "",
            { value: reais(items.reduce((sum, item) => sum + (item.kind === "income" ? item.amount_cents : -item.amount_cents), 0)), formula: `SUM(H${start}:H${end})` },
            { value: reais(items.reduce((sum, item) => sum + item.fee_cents, 0)), formula: `SUM(I${start}:I${end})` },
            { value: reais(items.reduce((sum, item) => sum + (item.kind === "income" ? item.amount_cents : -item.amount_cents) - item.fee_cents, 0)), formula: `SUM(J${start}:J${end})` },
            null,
            null,
          ]
        : undefined,
    notes: [`O total soma pagos e em aberto. Só os pagos: líquido de R$ ${reais(net).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`],
  }
}

/* ------------------------------------------------------------------ */
/* Comercial                                                           */
/* ------------------------------------------------------------------ */

function dealsSheet(input: ReportInput): Sheet {
  const { ctx, period } = input
  const inPeriod = (day: DateKey | null) => day !== null && day >= period.range.start && day <= period.range.end
  const deals = ctx.deals
    .filter((deal) => isOpenDeal(deal) || inPeriod(deal.opened_on) || inPeriod(deal.closed_on))
    .sort((a, b) => a.opened_on.localeCompare(b.opened_on))
  const ownerName = (id: string | null) => {
    const profile = id ? input.profiles.find((candidate) => candidate.id === id) : undefined
    return profile ? firstName(profile.full_name) : ""
  }
  const intro = [`Comercial — ${period.label}`, "Negócios em aberto e os que chegaram ou fecharam no período. Valor do contrato = pontual + mensal × meses (sem prazo: 12)."]
  const start = firstDataRow({ intro })
  const end = start + deals.length - 1
  return {
    name: "Comercial",
    intro,
    columns: [
      { header: "Negócio", width: 34 },
      { header: "Empresa / cliente", width: 24 },
      { header: "Origem", width: 14 },
      { header: "Frente", width: 16 },
      { header: "Etapa", width: 16 },
      { header: "Responsável", width: 12 },
      { header: "Mensal", width: 13, format: "money" },
      { header: "Pontual", width: 13, format: "money" },
      { header: "Meses", width: 7, format: "integer" },
      { header: "Valor do contrato", width: 15, format: "money" },
      { header: "Chance", width: 9, format: "percent" },
      { header: "Ponderado", width: 14, format: "money" },
      { header: "Chegou", width: 12, format: "date" },
      { header: "Proposta", width: 12, format: "date" },
      { header: "Previsão", width: 12, format: "date" },
      { header: "Fechado", width: 12, format: "date" },
      { header: "Motivo da perda", width: 24 },
    ],
    rows: deals.map((deal, index) => {
      const row = start + index
      return [
        deal.title,
        deal.client_id ? clientName(ctx, deal.client_id) : (deal.company ?? ""),
        LEAD_SOURCE_LABEL[deal.source],
        deal.service ?? "",
        DEAL_STAGE_LABEL[deal.stage],
        ownerName(deal.owner_id),
        reais(deal.recurring_cents),
        reais(deal.one_time_cents),
        deal.term_months,
        { value: reais(contractValue(deal)), formula: `H${row}+G${row}*IF(I${row}="",12,I${row})` },
        probabilityOf(deal) / 100,
        { value: reais((contractValue(deal) * probabilityOf(deal)) / 100), formula: `J${row}*K${row}` },
        deal.opened_on,
        deal.proposal_sent_on,
        deal.expected_close_on,
        deal.closed_on,
        deal.lost_reason ?? "",
      ]
    }),
    totals:
      deals.length > 0
        ? [
            "Total",
            "",
            "",
            "",
            "",
            "",
            { value: reais(deals.reduce((sum, deal) => sum + deal.recurring_cents, 0)), formula: `SUM(G${start}:G${end})` },
            { value: reais(deals.reduce((sum, deal) => sum + deal.one_time_cents, 0)), formula: `SUM(H${start}:H${end})` },
            null,
            { value: reais(deals.reduce((sum, deal) => sum + contractValue(deal), 0)), formula: `SUM(J${start}:J${end})` },
            null,
            { value: reais(deals.reduce((sum, deal) => sum + (contractValue(deal) * probabilityOf(deal)) / 100, 0)), formula: `SUM(L${start}:L${end})` },
            null,
            null,
            null,
            null,
            null,
          ]
        : undefined,
  }
}

/* ------------------------------------------------------------------ */
/* Operação                                                            */
/* ------------------------------------------------------------------ */

function tasksSheet(input: ReportInput): Sheet {
  const { ctx, period } = input
  const tasks = ctx.tasks
    .filter((task) => task.status === "done" && task.completed_at)
    .map((task) => ({ task, done: toDateKey(task.completed_at!) }))
    .filter(({ done }) => done >= period.range.start && done <= period.range.end)
    .sort((a, b) => a.done.localeCompare(b.done))
  const intro = [`Tarefas concluídas — ${period.label}`, "Atraso = dias entre o prazo e a conclusão (negativo = antes do prazo)."]
  const start = firstDataRow({ intro })
  const names = (ids: string[]) =>
    ids
      .map((id) => input.profiles.find((profile) => profile.id === id))
      .filter(Boolean)
      .map((profile) => firstName(profile!.full_name))
      .join(", ")
  return {
    name: "Tarefas",
    intro,
    columns: [
      { header: "Tarefa", width: 40 },
      { header: "Cliente", width: 20 },
      { header: "Projeto", width: 24 },
      { header: "Responsáveis", width: 20 },
      { header: "Prazo", width: 12, format: "date" },
      { header: "Concluída em", width: 13, format: "date" },
      { header: "Atraso (dias)", width: 12, format: "integer" },
      { header: "No prazo", width: 9 },
    ],
    rows: tasks.map(({ task, done }, index) => {
      const row = start + index
      const project = task.project_id ? ctx.projects.find((candidate) => candidate.id === task.project_id) : undefined
      return [
        task.title,
        clientName(ctx, task.client_id),
        project?.name ?? "",
        names(task.assignee_ids),
        task.due_date,
        done,
        task.due_date ? { value: daysBetween(task.due_date, done), formula: `IF(E${row}="","",F${row}-E${row})` } : null,
        task.due_date ? { value: done <= task.due_date ? "Sim" : "Não", formula: `IF(E${row}="","",IF(F${row}<=E${row},"Sim","Não"))` } : "",
      ]
    }),
  }
}

function projectsSheet(input: ReportInput): Sheet {
  const { ctx } = input
  return {
    name: "Projetos",
    columns: [
      { header: "Projeto", width: 34 },
      { header: "Cliente", width: 22 },
      { header: "Situação", width: 12 },
      { header: "Começo", width: 12, format: "date" },
      { header: "Prazo", width: 12, format: "date" },
      { header: "Concluído em", width: 13, format: "date" },
    ],
    rows: ctx.projects.map((project) => [
      project.name,
      project.client_id ? clientName(ctx, project.client_id) : "Interno",
      PROJECT_STATUS_LABEL[project.status],
      project.starts_on,
      project.due_on,
      project.completed_at ? toDateKey(project.completed_at) : null,
    ]),
  }
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

function goalsSheet(input: ReportInput): Sheet {
  const intro = ["Metas (OKRs)", "Progresso = (atual − base) ÷ (meta − base). Automáticos: calculados pelos indicadores, só com o realizado."]
  const start = firstDataRow({ intro })
  const rows: CellInput[][] = []
  for (const goal of input.goals) {
    for (const row of goal.keyResults) {
      const line = start + rows.length
      const cell = (value: number | null) => metricCell(value, row.unit)
      rows.push([
        goal.objective.title,
        { value: goal.objective.starts_on, format: "date" },
        { value: goal.objective.ends_on, format: "date" },
        row.keyResult.title,
        row.metricLabel ?? "Manual",
        cell(row.baseline),
        cell(row.current),
        cell(row.target),
        { value: row.progress, format: "percent", formula: `IFERROR((G${line}-F${line})/(H${line}-F${line}),"")` },
        GOAL_STATE_LABEL[row.state],
      ])
    }
  }
  return {
    name: "Metas",
    intro,
    columns: [
      { header: "Objetivo", width: 32 },
      { header: "De", width: 11 },
      { header: "Até", width: 11 },
      { header: "Resultado-chave", width: 34 },
      { header: "Indicador", width: 24 },
      { header: "Base", width: 13 },
      { header: "Atual", width: 13 },
      { header: "Meta", width: 13 },
      { header: "Progresso", width: 11 },
      { header: "Situação", width: 13 },
    ],
    rows,
  }
}

/* ------------------------------------------------------------------ */
/* Pasta                                                               */
/* ------------------------------------------------------------------ */

export function reportSheets(input: ReportInput): Sheet[] {
  const sheets: Sheet[] = [aboutSheet(input)]
  const has = (section: ReportSection) => input.sections.includes(section)
  if (has("indicadores")) sheets.push(indicatorsSheet(input))
  if (has("dre")) sheets.push(dreSheet(input))
  if (has("projecao")) sheets.push(projectionSheet(input))
  if (has("contratos")) sheets.push(contractsSheet(input), recurrencesSheet(input))
  if (has("lancamentos")) sheets.push(ledgerSheet(input))
  if (has("comercial")) sheets.push(dealsSheet(input))
  if (has("operacional")) sheets.push(tasksSheet(input), projectsSheet(input))
  if (has("metas")) sheets.push(goalsSheet(input))
  // As fórmulas do DRE leem a alíquota da aba Premissas.
  sheets.push(premissasSheet(input.ctx))
  return sheets
}

