import "server-only"

import { periodLabel, periodOf } from "@/features/clients/logic"
import { itemStatus, monthItems, overdueItems, type FinanceItem, type FinanceStatus } from "@/features/finance/logic"
import { dreMonth, indexFinance, recurrenceSummary } from "@/features/finance/management"
import { formatMoney, parseMoney } from "@/features/finance/money"
import {
  closeMonthWith,
  insertEntry,
  insertRecurrence,
  patchEntry,
  patchOccurrence,
  patchRecurrence,
  removeEntry,
  removeRecurrence,
  reopenMonthWith,
} from "@/features/finance/mutations"
import { fetchFinance } from "@/features/finance/queries"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, findByName, isClear, joinSections, readBoolean, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import {
  CONFIRM,
  DESTRUCTIVE,
  EDIT,
  READ_ONLY,
  WRITE,
  confirmFirst,
  enumOptions,
  enumValue,
  findClient,
  findProject,
  limited,
  readMoney,
  readOptionalDate,
  todayLine,
} from "@/features/mcp/tools/common"
import { formatShortDate, isDateKey } from "@/lib/dates"
import { FINANCE_ACCOUNTS, FINANCE_ACCOUNT_LABEL, accountKind } from "@/lib/labels"
import type { DateKey, FinanceRecurrence } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Financeiro pelo conector, para quem já vê o financeiro na tela (mesmo RLS):
 * o mês (resultado e lançamentos), lançar, editar, marcar pago (com a taxa do
 * gateway), excluir, recorrências e fechar/reabrir o mês. Valores sempre em
 * reais. As gravações passam por features/finance/mutations.ts, com a trava
 * do mês fechado do banco.
 */

type Args = Record<string, unknown>

const STATUS_LABEL: Record<FinanceStatus, string> = { paid: "pago", overdue: "atrasado", pending: "a vencer", skipped: "pulado" }

/** Mês: "2026-10", uma data do mês ou nada (o mês de hoje). */
function readPeriod(args: Args, key: string, today: DateKey): Parsed<DateKey> {
  const raw = readText(args, key, 20)
  if (!raw.ok) return raw
  if (!raw.value) return { ok: true, value: periodOf(today) }
  const value = /^\d{4}-\d{2}$/.test(raw.value) ? `${raw.value}-01` : raw.value
  return isDateKey(value) ? { ok: true, value: periodOf(value) } : { ok: false, error: `Mês inválido em "${key}": use aaaa-mm (ex.: 2026-10).` }
}

const ENTRY_FIELDS = {
  categoria: { type: "string", enum: enumOptions(FINANCE_ACCOUNTS, FINANCE_ACCOUNT_LABEL), description: "Categoria gerencial (define se é receita ou despesa)." },
  descricao: { type: "string", maxLength: 200 },
  valor: { description: "Valor em reais (ex.: 3500 ou \"3.500,00\")." },
  vencimento: { type: "string", description: "aaaa-mm-dd ou dd/mm." },
  pago_em: { type: "string", description: "Data do pagamento (aaaa-mm-dd ou \"hoje\"). \"nenhum\" desmarca." },
  taxa: { description: "Taxa do gateway em reais (só receitas pagas)." },
  subcategoria: { type: "string", maxLength: 60, description: "Detalhe livre (ex.: Ferramentas). \"nenhum\" tira." },
  cliente: { type: "string", description: "Nome (ou id) do cliente. Obrigatório em receita de cliente. \"nenhum\" tira." },
  projeto: { type: "string", description: "Nome (ou id) do projeto. \"nenhum\" tira." },
  observacoes: { type: "string", maxLength: 2000 },
} as const

/** Campos comuns de lançamento e recorrência, no formato das Server Actions (só o que veio). */
function readCommon(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("descricao" in args) patch.description = args.descricao
  if ("subcategoria" in args) patch.category = isClear(args.subcategoria) ? null : args.subcategoria
  if ("observacoes" in args) patch.notes = isClear(args.observacoes) ? null : args.observacoes
  if ("categoria" in args) {
    const raw = readText(args, "categoria", 60)
    const account = enumValue(raw.ok ? raw.value : null, FINANCE_ACCOUNTS, FINANCE_ACCOUNT_LABEL)
    if (!account) return { ok: false, error: `Categoria inválida. Opções: ${FINANCE_ACCOUNTS.map((value) => FINANCE_ACCOUNT_LABEL[value]).join(", ")}.` }
    patch.account = account
    patch.kind = accountKind(account)
  }
  const amount = readMoney(args, "valor")
  if (!amount.ok) return amount
  if (amount.value !== undefined) patch.amount_cents = amount.value
  let clientId: string | null | undefined
  if ("cliente" in args) {
    if (isClear(args.cliente)) clientId = patch.client_id = null
    else {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return client
      clientId = patch.client_id = client.value.id
    }
  }
  if ("projeto" in args) {
    if (isClear(args.projeto)) patch.project_id = null
    else {
      const project = findProject(directory, String(args.projeto), clientId)
      if (!project.ok) return project
      patch.project_id = project.value.id
    }
  }
  return { ok: true, value: patch }
}

function readEntryPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const common = readCommon(args, context, directory)
  if (!common.ok) return common
  const patch = common.value
  const due = readOptionalDate(args, "vencimento", context.today)
  if (!due.ok) return due
  if (due.value) patch.due_on = due.value
  const paid = readOptionalDate(args, "pago_em", context.today)
  if (!paid.ok) return paid
  if (paid.value !== undefined) patch.paid_on = paid.value
  const fee = readMoney(args, "taxa")
  if (!fee.ok) return fee
  if (fee.value !== undefined) patch.fee_cents = fee.value
  if ("pulado" in args) patch.skipped = readBoolean(args, "pulado")
  return { ok: true, value: patch }
}

function itemLine(item: FinanceItem, directory: Directory, today: DateKey): string {
  const names = namesOf(directory)
  const status = itemStatus(item, today)
  return bullet(
    formatShortDate(item.due_on, today),
    item.description,
    `${item.kind === "income" ? "+" : "−"}${formatMoney(item.amount_cents)}`,
    FINANCE_ACCOUNT_LABEL[item.account],
    STATUS_LABEL[status] + (item.paid_on && item.paid_on !== item.due_on ? ` em ${formatShortDate(item.paid_on, today)}` : ""),
    item.fee_cents > 0 ? `taxa ${formatMoney(item.fee_cents)}` : null,
    names.client(item.client_id),
    item.recurrence ? "recorrente" : null,
    `item ${item.key}`
  )
}

/** Um item pelo `item` das listas: o id do lançamento ou "r:<recorrência>:<mês>" (mês ainda não gravado). */
type ItemRef = { entryId: string } | { recurrenceId: string; period: DateKey }

function readItem(args: Args): Parsed<ItemRef> {
  const raw: string = typeof args.item === "string" ? args.item.trim().toLowerCase() : ""
  const match = raw.match(/^r:([0-9a-f-]{36}):(\d{4}-\d{2}-01)$/)
  if (isUuid(raw)) return { ok: true, value: { entryId: raw } }
  if (match && isUuid(match[1])) return { ok: true, value: { recurrenceId: match[1]!, period: match[2]! } }
  return { ok: false, error: "Informe o item como vem em financeiro_do_mes (o id do lançamento ou \"r:…\")." }
}

async function saveItem(context: McpContext, ref: ItemRef, patch: Record<string, unknown>): Promise<Parsed<null>> {
  const saved =
    "entryId" in ref
      ? await patchEntry(context.supabase, ref.entryId, patch)
      : await patchOccurrence(context.supabase, ref.recurrenceId, ref.period, patch)
  return saved.ok ? { ok: true, value: null } : saved
}

/* ------------------------------------------------------------------ */
/* O mês                                                               */
/* ------------------------------------------------------------------ */

const monthSummary: Tool<McpContext> = {
  name: "financeiro_do_mes",
  title: "Financeiro do mês",
  description:
    "O mês no financeiro, em reais: resultado (receita, imposto, taxas, custos, margem e resultado), os lançamentos do mês (receitas e despesas, com situação: pago, a vencer, atrasado, pulado) e o que está atrasado de meses anteriores. Cada item vem com o `item` para editar ou marcar pago.",
  inputSchema: { type: "object", properties: { mes: { type: "string", description: "Mês (aaaa-mm). Padrão: o atual." } }, additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const period = readPeriod(args, "mes", today)
    if (!period.ok) return toolError(period.error)
    const [directory, finance] = await Promise.all([loadDirectory(supabase), fetchFinance(supabase)])
    const index = indexFinance(finance, today)
    const dre = dreMonth(index, period.value)
    const items = monthItems(finance.entries, finance.recurrences, period.value)
    const overdue = overdueItems(finance.entries, finance.recurrences, today).filter((item) => item.due_on < period.value)
    const statusLabel = { closed: "fechado", realized: "realizado", current: "mês atual: realizado + a vencer", forecast: "previsto" }[dre.status]
    const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`)

    return textResult(
      joinSections(
        `Financeiro de ${periodLabel(period.value)} (${statusLabel}). ${todayLine(context)}`,
        [
          `- Receita: ${formatMoney(dre.revenue)} (já entrou ${formatMoney(dre.realizedRevenue)})`,
          `- Imposto (provisão): ${formatMoney(dre.tax)} · taxas: ${formatMoney(dre.fees)} · custos diretos: ${formatMoney(dre.directCosts)}`,
          `- Margem de contribuição: ${formatMoney(dre.contribution)} (${pct(dre.contributionMargin)})`,
          `- Custos fixos: ${formatMoney(dre.fixedCosts)} · outras despesas: ${formatMoney(dre.otherExpenses)}`,
          `- Resultado: ${formatMoney(dre.result)} (${pct(dre.margin)})`,
          `- Fora do resultado: aportes ${formatMoney(dre.ownerContributions)}, DAS pago ${formatMoney(dre.taxPaid)}, pró-labore ${formatMoney(dre.ownerDraws)}, reinvestimento ${formatMoney(dre.reinvestments)}`,
        ].join("\n"),
        section(`Receitas (${items.filter((item) => item.kind === "income").length})`, limited(items.filter((item) => item.kind === "income").map((item) => itemLine(item, directory, today)))),
        section(`Despesas (${items.filter((item) => item.kind === "expense").length})`, limited(items.filter((item) => item.kind === "expense").map((item) => itemLine(item, directory, today)))),
        section(`Atrasados de meses anteriores (${overdue.length})`, limited(overdue.map((item) => itemLine(item, directory, today)), 20))
      ) + `\n\nNo Boop Admin: ${origin}/financeiro`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

const createEntry: Tool<McpContext> = {
  name: "lancar",
  title: "Lançar no financeiro",
  description: "Cria um lançamento avulso (receita ou despesa, pela categoria). Para algo que se repete todo mês, criar_recorrencia.",
  inputSchema: { type: "object", properties: ENTRY_FIELDS, required: ["categoria", "descricao", "valor", "vencimento"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const patch = readEntryPatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    const created = await insertEntry(context.supabase, patch.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Lançado: ${String(patch.value.description)} · ${formatMoney(Number(patch.value.amount_cents))} (item ${created.data.id}).\n${context.origin}/financeiro`)
  },
}

const editEntry: Tool<McpContext> = {
  name: "editar_lancamento",
  title: "Editar lançamento",
  description:
    "Muda um lançamento ou o mês de uma recorrência (só deste mês): descrição, valor, vencimento, pago em, taxa, pulado, categoria, cliente, projeto. Num mês fechado, valores e pagamentos não mudam (reabra antes).",
  inputSchema: {
    type: "object",
    properties: {
      item: { type: "string", description: "O `item` de financeiro_do_mes: id do lançamento ou \"r:<recorrência>:<mês>\"." },
      ...ENTRY_FIELDS,
      pulado: { type: "boolean", description: "Pular este mês (não vai acontecer)." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const ref = readItem(args)
    if (!ref.ok) return toolError(ref.error)
    const patch = readEntryPatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    delete patch.value.kind
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await saveItem(context, ref.value, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Lançamento salvo.\n${context.origin}/financeiro`)
  },
}

const markPaid: Tool<McpContext> = {
  name: "marcar_pago",
  title: "Marcar como pago",
  description: "Marca um lançamento (ou o mês de uma recorrência) como pago, na data informada (padrão: hoje), com a taxa do gateway nas receitas.",
  inputSchema: {
    type: "object",
    properties: {
      item: { type: "string", description: "O `item` de financeiro_do_mes." },
      pago_em: { type: "string", description: "Data do pagamento (aaaa-mm-dd ou dd/mm). Padrão: hoje." },
      taxa: { description: "Taxa do gateway em reais (padrão: zero)." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const ref = readItem(args)
    if (!ref.ok) return toolError(ref.error)
    const paid = readOptionalDate(args, "pago_em", context.today)
    if (!paid.ok) return toolError(paid.error)
    const fee = readMoney(args, "taxa")
    if (!fee.ok) return toolError(fee.error)
    const patch: Record<string, unknown> = { paid_on: paid.value ?? context.today, skipped: false }
    if (fee.value !== undefined) patch.fee_cents = fee.value
    const saved = await saveItem(context, ref.value, patch)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Marcado como pago em ${formatShortDate(String(patch.paid_on), context.today)}${fee.value ? `, taxa ${formatMoney(fee.value)}` : ""}.\n${context.origin}/financeiro`)
  },
}

const deleteEntry: Tool<McpContext> = {
  name: "excluir_lancamento",
  title: "Excluir lançamento",
  description: "Exclui um lançamento gravado (para um mês de recorrência que não vai acontecer, prefira editar_lancamento com pulado: true). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: {
    type: "object",
    properties: { item: { type: "string", description: "O id do lançamento (de financeiro_do_mes)." }, confirmar: CONFIRM },
    required: ["item"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const ref = readItem(args)
    if (!ref.ok) return toolError(ref.error)
    if (!("entryId" in ref.value)) return toolError("Esse mês da recorrência ainda não foi gravado: para ele não acontecer, use editar_lancamento com pulado: true.")
    const entryId = ref.value.entryId
    const finance = await fetchFinance(context.supabase)
    const entry = finance.entries.find((candidate) => candidate.id === entryId)
    if (!entry) return toolError("Esse lançamento não existe mais.")
    const pending = confirmFirst(args, `o lançamento "${entry.description}" (${formatMoney(entry.amount_cents)}, vence ${formatShortDate(entry.due_on, context.today)})`, [
      entry.paid_on ? `Está pago (${formatShortDate(entry.paid_on, context.today)}): o saldo e o resultado do mês mudam.` : "Ainda não foi pago.",
      entry.recurrence_id ? "É o mês de uma recorrência: o mês volta a aparecer com o valor da recorrência." : "É um lançamento avulso.",
    ])
    if (pending) return pending
    const removed = await removeEntry(context.supabase, entry.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Lançamento "${entry.description}" excluído.`)
  },
}

/* ------------------------------------------------------------------ */
/* Recorrências                                                        */
/* ------------------------------------------------------------------ */

const RECURRENCE_FIELDS = {
  ...ENTRY_FIELDS,
  dia: { type: "integer", minimum: 1, maximum: 31, description: "Dia do vencimento todo mês." },
  inicio: { type: "string", description: "Mês inicial (aaaa-mm)." },
  fim: { type: "string", description: "Último mês (aaaa-mm). \"nenhum\" = sem prazo." },
} as const

function readRecurrencePatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const common = readCommon(args, context, directory)
  if (!common.ok) return common
  const patch = common.value
  if ("dia" in args) patch.day_of_month = args.dia
  if ("inicio" in args) {
    const start = readPeriod(args, "inicio", context.today)
    if (!start.ok) return start
    patch.starts_on = start.value
  }
  if ("fim" in args) {
    if (isClear(args.fim)) patch.ends_on = null
    else {
      const end = readPeriod(args, "fim", context.today)
      if (!end.ok) return end
      patch.ends_on = end.value
    }
  }
  return { ok: true, value: patch }
}

function findRecurrence(recurrences: FinanceRecurrence[], query: string): Parsed<FinanceRecurrence> {
  return findByName(recurrences, query, (recurrence) => recurrence.description, (recurrence) => recurrence.id, "recorrência", (recurrence) =>
    formatMoney(recurrence.amount_cents)
  )
}

const RECURRENCE_ARG = { type: "string", description: "Id (de preferência) ou descrição da recorrência." } as const

const listRecurrences: Tool<McpContext> = {
  name: "recorrencias",
  title: "Recorrências",
  description: "Contratos e custos que se repetem todo mês, em reais: valor, dia, categoria, cliente, situação (ativa, futura, encerrada), parcelas e total que ainda faltam.",
  inputSchema: { type: "object", properties: { incluir_encerradas: { type: "boolean" } }, additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const [directory, finance] = await Promise.all([loadDirectory(supabase), fetchFinance(supabase)])
    const names = namesOf(directory)
    const index = indexFinance(finance, today)
    const stateLabel = { active: "ativa", future: "começa depois", ended: "encerrada" } as const
    const lines = finance.recurrences
      .map((recurrence) => recurrenceSummary(index, recurrence))
      .filter((summary) => summary.state !== "ended" || readBoolean(args, "incluir_encerradas"))
      .map((summary) => {
        const recurrence = summary.recurrence
        return bullet(
          recurrence.description,
          `${recurrence.kind === "income" ? "+" : "−"}${formatMoney(recurrence.amount_cents)}/mês`,
          `dia ${recurrence.day_of_month}`,
          FINANCE_ACCOUNT_LABEL[recurrence.account],
          names.client(recurrence.client_id),
          stateLabel[summary.state],
          `de ${periodLabel(recurrence.starts_on)}${recurrence.ends_on ? ` a ${periodLabel(recurrence.ends_on)}` : ", sem prazo"}`,
          summary.remaining !== null && summary.state !== "ended" ? `faltam ${summary.remaining} (${formatMoney(summary.remainingTotal ?? 0)})` : null,
          summary.ending ? "termina em breve" : null,
          `id ${recurrence.id}`
        )
      })
    return textResult(`${lines.join("\n") || "Nenhuma recorrência."}\n\nNo Boop Admin: ${origin}/financeiro`)
  },
}

const createRecurrence: Tool<McpContext> = {
  name: "criar_recorrencia",
  title: "Criar recorrência",
  description: "Cria um contrato ou custo mensal (receita ou despesa, pela categoria): valor, dia do vencimento, mês inicial e, se tiver, o último mês.",
  inputSchema: { type: "object", properties: RECURRENCE_FIELDS, required: ["categoria", "descricao", "valor", "dia", "inicio"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const patch = readRecurrencePatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    const created = await insertRecurrence(context.supabase, patch.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Recorrência criada: ${String(patch.value.description)} · ${formatMoney(Number(patch.value.amount_cents))}/mês (id ${created.data.id}).\n${context.origin}/financeiro`)
  },
}

const editRecurrence: Tool<McpContext> = {
  name: "editar_recorrencia",
  title: "Editar recorrência",
  description: "Muda uma recorrência (só os campos informados). Vale para os meses ainda não gravados; os já gravados (pagos, por exemplo) ficam como estão. O mês inicial não muda.",
  inputSchema: {
    type: "object",
    properties: { recorrencia: RECURRENCE_ARG, ...Object.fromEntries(Object.entries(RECURRENCE_FIELDS).filter(([key]) => !["inicio", "vencimento", "pago_em", "taxa"].includes(key))) },
    required: ["recorrencia"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "recorrencia", 200)
    if (!query.ok) return toolError(query.error)
    const finance = await fetchFinance(context.supabase)
    const found = findRecurrence(finance.recurrences, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readRecurrencePatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    delete patch.value.kind
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchRecurrence(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Recorrência "${found.value.description}" salva.\n${context.origin}/financeiro`)
  },
}

const deleteRecurrence: Tool<McpContext> = {
  name: "excluir_recorrencia",
  title: "Excluir recorrência",
  description: "Exclui uma recorrência (para encerrar um contrato, prefira editar_recorrencia com o último mês). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { recorrencia: RECURRENCE_ARG, confirmar: CONFIRM }, required: ["recorrencia"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "recorrencia", 200)
    if (!query.ok) return toolError(query.error)
    const finance = await fetchFinance(context.supabase)
    const found = findRecurrence(finance.recurrences, query.value)
    if (!found.ok) return toolError(found.error)
    const recurrence = found.value
    const saved = finance.entries.filter((entry) => entry.recurrence_id === recurrence.id).length
    const pending = confirmFirst(args, `a recorrência "${recurrence.description}" (${formatMoney(recurrence.amount_cents)}/mês)`, [
      "Os meses ainda não gravados somem do financeiro (e da projeção e do MRR).",
      saved > 0 ? `${saved} ${saved === 1 ? "mês já gravado continua" : "meses já gravados continuam"} no histórico.` : "Nenhum mês gravado.",
    ])
    if (pending) return pending
    const removed = await removeRecurrence(context.supabase, recurrence.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Recorrência "${recurrence.description}" excluída.`)
  },
}

/* ------------------------------------------------------------------ */
/* Fechamento                                                          */
/* ------------------------------------------------------------------ */

/** Saldo do extrato em reais, que pode ser negativo. */
function readBalance(args: Args): Parsed<number> {
  const raw = args.saldo_extrato
  if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: Math.round(raw * 100) }
  if (typeof raw === "string") {
    const negative = /^\s*-/.test(raw)
    const text = raw.replace(/^\s*-/, "")
    const cents = /^\s*(R\$)?\s*0+([.,]0{1,2})?\s*$/.test(text) ? 0 : parseMoney(text)
    if (cents !== null) return { ok: true, value: negative ? -cents : cents }
  }
  return { ok: false, error: "Informe o saldo do extrato no último dia do mês, em reais (ex.: 12500 ou \"-300,00\")." }
}

const closeMonth: Tool<McpContext> = {
  name: "fechar_mes",
  title: "Fechar mês",
  description:
    "Fecha um mês já encerrado: guarda o saldo pelos lançamentos e o do extrato do banco. Depois disso, os valores e pagamentos do mês não mudam. Os meses fecham em ordem.",
  inputSchema: {
    type: "object",
    properties: {
      mes: { type: "string", description: "Mês (aaaa-mm), já terminado." },
      saldo_extrato: { description: "Saldo do extrato no último dia do mês, em reais." },
      observacoes: { type: "string", maxLength: 2000 },
    },
    required: ["mes", "saldo_extrato"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const period = readPeriod(args, "mes", context.today)
    if (!period.ok) return toolError(period.error)
    const balance = readBalance(args)
    if (!balance.ok) return toolError(balance.error)
    const closed = await closeMonthWith(context.supabase, { period: period.value, bank_balance_cents: balance.value, notes: args.observacoes ?? null }, context.today)
    if (!closed.ok) return toolError(closed.error)
    const diff = balance.value - closed.data.ledger_balance_cents
    return textResult(
      `${periodLabel(period.value)} fechado. Saldo pelos lançamentos: ${formatMoney(closed.data.ledger_balance_cents)}; extrato: ${formatMoney(balance.value)}${diff !== 0 ? ` (diferença de ${formatMoney(diff)})` : " (bateu)"}.\n${context.origin}/financeiro`
    )
  },
}

const reopenMonth: Tool<McpContext> = {
  name: "reabrir_mes",
  title: "Reabrir mês",
  description: "Reabre um mês fechado (os pagamentos dele voltam a poder mudar). Reabra do mais novo para o mais antigo. Em dois passos: sem confirmar, só descreve; com confirmar: true, reabre.",
  inputSchema: {
    type: "object",
    properties: { mes: { type: "string", description: "Mês (aaaa-mm)." }, confirmar: CONFIRM },
    required: ["mes"],
    additionalProperties: false,
  },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const period = readPeriod(args, "mes", context.today)
    if (!period.ok) return toolError(period.error)
    const finance = await fetchFinance(context.supabase)
    const closing = finance.closings.find((row) => row.period === period.value)
    if (!closing) return toolError(`${periodLabel(period.value)} não está fechado.`)
    const pending = confirmFirst(args, `o fechamento de ${periodLabel(period.value)}`, [
      `Saldo guardado: ${formatMoney(closing.ledger_balance_cents)} pelos lançamentos e ${formatMoney(closing.bank_balance_cents)} no extrato.`,
      "Os valores e pagamentos do mês voltam a poder mudar; para travar de novo, feche o mês outra vez.",
    ])
    if (pending) return pending
    const reopened = await reopenMonthWith(context.supabase, period.value)
    if (!reopened.ok) return toolError(reopened.error)
    return textResult(`${periodLabel(period.value)} reaberto.`)
  },
}

export const FINANCE_TOOLS = [
  monthSummary,
  createEntry,
  editEntry,
  markPaid,
  deleteEntry,
  listRecurrences,
  createRecurrence,
  editRecurrence,
  deleteRecurrence,
  closeMonth,
  reopenMonth,
]
