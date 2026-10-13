import "server-only"

import { contractValue, defaultContractStart, isOpenDeal, pipeline, probabilityOf } from "@/features/deals/logic"
import { insertDeal, markDealWon, patchDeal, removeDeal } from "@/features/deals/mutations"
import { fetchDeals } from "@/features/deals/queries"
import { formatMoney } from "@/features/finance/money"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, excerpt, findByName, isClear, joinSections, readRequiredText, readText, section, type Parsed } from "@/features/mcp/logic"
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
  findPerson,
  limited,
  readMoney,
  readOptionalDate,
  todayLine,
} from "@/features/mcp/tools/common"
import { addDaysToKey, formatShortDate } from "@/lib/dates"
import { DEAL_STAGES, DEAL_STAGE_LABEL, LEAD_SOURCES, LEAD_SOURCE_LABEL } from "@/lib/labels"
import type { DateKey, Deal } from "@/lib/types"

/*
 * Comercial pelo conector: o funil, ver, criar, editar (mover de etapa,
 * perder, reabrir), ganhar (cliente, contrato, entrada e projeto pela função
 * win_deal do banco) e excluir. Valores em reais. As gravações passam por
 * features/deals/mutations.ts.
 */

type Args = Record<string, unknown>

const DEAL_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  empresa: { type: "string", maxLength: 200 },
  cliente: { type: "string", description: "Cliente existente (nome ou id). \"nenhum\" tira." },
  contato_nome: { type: "string" },
  contato_email: { type: "string" },
  contato_telefone: { type: "string" },
  origem: { type: "string", enum: enumOptions(LEAD_SOURCES, LEAD_SOURCE_LABEL) },
  servico: { type: "string", description: "Frente (ex.: Social media)." },
  etapa: { type: "string", enum: enumOptions(DEAL_STAGES.filter((stage) => stage !== "won"), DEAL_STAGE_LABEL), description: "Para ganhar, use ganhar_negocio." },
  motivo_perda: { type: "string", maxLength: 500, description: "Com etapa perdido." },
  responsavel: { type: "string", description: "Pessoa da equipe (\"eu\" = você). \"nenhum\" tira." },
  mensal: { description: "Valor mensal em reais (ex.: 2500 ou \"2.500,00\")." },
  pontual: { description: "Valor pontual (setup, projeto) em reais." },
  duracao_meses: { type: ["integer", "null"], minimum: 1, maximum: 120 },
  chance: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "Chance de fechar, em %. null = a padrão da etapa." },
  chegou_em: { type: "string", description: "Quando o lead chegou (aaaa-mm-dd). Padrão: hoje." },
  previsao: { type: "string", description: "Previsão de fechamento (aaaa-mm-dd). \"nenhum\" tira." },
  observacoes: { type: "string", maxLength: 5000 },
} as const

function readDealPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  const texts = [
    ["titulo", "title"],
    ["empresa", "company"],
    ["contato_nome", "contact_name"],
    ["contato_email", "contact_email"],
    ["contato_telefone", "contact_phone"],
    ["servico", "service"],
    ["motivo_perda", "lost_reason"],
    ["observacoes", "notes"],
  ] as const
  for (const [key, field] of texts) if (key in args) patch[field] = key !== "titulo" && isClear(args[key]) ? null : args[key]
  if ("cliente" in args) {
    if (isClear(args.cliente)) patch.client_id = null
    else {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return client
      patch.client_id = client.value.id
    }
  }
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) patch.owner_id = null
    else {
      const person = findPerson(directory, String(args.responsavel), context.user.id)
      if (!person.ok) return person
      patch.owner_id = person.value.id
    }
  }
  for (const [key, field, values, labels] of [
    ["origem", "source", LEAD_SOURCES, LEAD_SOURCE_LABEL],
    ["etapa", "stage", DEAL_STAGES, DEAL_STAGE_LABEL],
  ] as const) {
    if (!(key in args)) continue
    const raw = readText(args, key, 40)
    const value = enumValue(raw.ok ? raw.value : null, values as readonly string[], labels as Record<string, string>)
    if (!value) return { ok: false, error: `Valor inválido em "${key}". Opções: ${values.map((option) => (labels as Record<string, string>)[option]).join(", ")}.` }
    patch[field] = value
  }
  for (const [key, field] of [["mensal", "recurring_cents"], ["pontual", "one_time_cents"]] as const) {
    const money = readMoney(args, key)
    if (!money.ok) return money
    if (money.value !== undefined) patch[field] = money.value
  }
  if ("duracao_meses" in args) patch.term_months = args.duracao_meses ?? null
  if ("chance" in args) patch.probability = args.chance ?? null
  const opened = readOptionalDate(args, "chegou_em", context.today)
  if (!opened.ok) return opened
  if (opened.value) patch.opened_on = opened.value
  const close = readOptionalDate(args, "previsao", context.today)
  if (!close.ok) return close
  if (close.value !== undefined) patch.expected_close_on = close.value
  return { ok: true, value: patch }
}

function dealLine(deal: Deal, directory: Directory, today: DateKey): string {
  const names = namesOf(directory)
  return bullet(
    deal.title,
    names.client(deal.client_id) ?? deal.company,
    DEAL_STAGE_LABEL[deal.stage],
    deal.recurring_cents > 0 ? `${formatMoney(deal.recurring_cents)}/mês` : null,
    deal.one_time_cents > 0 ? `${formatMoney(deal.one_time_cents)} pontual` : null,
    isOpenDeal(deal) ? `chance ${probabilityOf(deal)}%` : null,
    isOpenDeal(deal) && deal.expected_close_on ? `previsão ${formatShortDate(deal.expected_close_on, today)}` : null,
    deal.closed_on ? `fechado em ${formatShortDate(deal.closed_on, today)}` : null,
    names.person(deal.owner_id) ? `com ${names.person(deal.owner_id)}` : null,
    `id ${deal.id}`
  )
}

async function findDeal(context: McpContext, query: string): Promise<Parsed<Deal>> {
  const deals = await fetchDeals(context.supabase)
  const open = findByName(deals.filter(isOpenDeal), query, (deal) => deal.title, (deal) => deal.id, "negócio aberto", (deal) => deal.company ?? DEAL_STAGE_LABEL[deal.stage])
  if (open.ok) return open
  const any = findByName(deals, query, (deal) => deal.title, (deal) => deal.id, "negócio", (deal) => DEAL_STAGE_LABEL[deal.stage])
  return any.ok ? any : open
}

const DEAL_ARG = { type: "string", description: "Id (de preferência) ou nome do negócio." } as const

/* ------------------------------------------------------------------ */
/* Ver                                                                 */
/* ------------------------------------------------------------------ */

const listDeals: Tool<McpContext> = {
  name: "comercial",
  title: "Comercial (funil)",
  description: "O funil de vendas: negócios em aberto por etapa, com valores em reais (mensal, pontual, contrato e ponderado pela chance), previsões vencidas e os fechados nos últimos 30 dias.",
  inputSchema: { type: "object", properties: { incluir_fechados: { type: "boolean", description: "Também todos os ganhos e perdidos." } }, additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const [directory, deals] = await Promise.all([loadDirectory(supabase), fetchDeals(supabase)])
    const funnel = pipeline(deals, today)
    const all = args.incluir_fechados === true
    const closed = deals.filter((deal) => !isOpenDeal(deal) && (all || (deal.closed_on !== null && deal.closed_on >= addDaysToKey(today, -30))))
    return textResult(
      joinSections(
        `Funil: ${count(funnel.count, "negócio aberto", "negócios abertos")} · ${formatMoney(funnel.recurring)}/mês e ${formatMoney(funnel.oneTime)} pontual · contratos ${formatMoney(funnel.value)} · ponderado ${formatMoney(funnel.weighted)}. ${todayLine(context)}`,
        ...funnel.byStage.map((stage) =>
          section(
            `${DEAL_STAGE_LABEL[stage.stage]} (${stage.count} · ${formatMoney(stage.value)})`,
            funnel.deals.filter((deal) => deal.stage === stage.stage).map((deal) => dealLine(deal, directory, today))
          )
        ),
        section(`Previsão de fechamento vencida (${funnel.stale.length})`, funnel.stale.map((deal) => dealLine(deal, directory, today))),
        section(all ? `Fechados (${closed.length})` : `Fechados nos últimos 30 dias (${closed.length})`, limited(closed.map((deal) => dealLine(deal, directory, today))))
      ) + `\n\nNo Boop Admin: ${origin}/comercial`
    )
  },
}

const viewDeal: Tool<McpContext> = {
  name: "ver_negocio",
  title: "Ver negócio",
  description: "Um negócio por inteiro: contato, origem, frente, valores em reais, duração, chance, datas, motivo da perda e observações.",
  inputSchema: { type: "object", properties: { negocio: DEAL_ARG }, required: ["negocio"], additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const query = readRequiredText(args, "negocio", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDeal(context, query.value)
    if (!found.ok) return toolError(found.error)
    const deal = found.value
    const directory = await loadDirectory(context.supabase)
    const today = context.today
    return textResult(
      joinSections(
        `Negócio "${deal.title}" (id ${deal.id})`,
        [
          dealLine(deal, directory, today),
          bullet(`Origem: ${LEAD_SOURCE_LABEL[deal.source]}`, deal.service ? `frente ${deal.service}` : null, `chegou em ${formatShortDate(deal.opened_on, today)}`),
          bullet(`Contato: ${[deal.contact_name, deal.contact_email, deal.contact_phone].filter(Boolean).join(" · ") || "não informado"}`),
          bullet(`Contrato: ${formatMoney(contractValue(deal))}`, deal.term_months ? `${deal.term_months} meses` : null),
          deal.lost_reason ? `- Motivo da perda: ${deal.lost_reason}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        deal.notes ? `Observações:\n${excerpt(deal.notes, 2000)}` : null
      ) + `\n\n${context.origin}/comercial`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Criar, editar, ganhar, excluir                                      */
/* ------------------------------------------------------------------ */

const createDeal: Tool<McpContext> = {
  name: "criar_negocio",
  title: "Criar negócio",
  description: "Cria um negócio (lead) no comercial. Só o título é obrigatório; começa em Lead, com a data de hoje.",
  inputSchema: { type: "object", properties: DEAL_FIELDS, required: ["titulo"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const patch = readDealPatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    const created = await insertDeal(context.supabase, { opened_on: context.today, ...patch.value })
    if (!created.ok) return toolError(created.error)
    return textResult(`Negócio criado (id ${created.data.id}).\n${context.origin}/comercial`)
  },
}

const editDeal: Tool<McpContext> = {
  name: "editar_negocio",
  title: "Editar negócio",
  description: "Muda um negócio (só os campos informados): mover de etapa, perder (etapa perdido + motivo_perda), reabrir (voltar a uma etapa aberta), valores, contato, responsável e datas. Para ganhar, ganhar_negocio.",
  inputSchema: { type: "object", properties: { negocio: DEAL_ARG, ...DEAL_FIELDS }, required: ["negocio"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "negocio", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDeal(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readDealPatch(args, context, await loadDirectory(context.supabase))
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchDeal(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Negócio "${found.value.title}" salvo.\n${context.origin}/comercial`)
  },
}

const winDeal: Tool<McpContext> = {
  name: "ganhar_negocio",
  title: "Ganhar negócio",
  description:
    "Marca o negócio como ganho e, na mesma operação, liga ou cria o cliente, cria o contrato (recorrência mensal no financeiro, com o valor mensal), lança a entrada pontual e cria o projeto, conforme o que for informado. Confirme os detalhes com a pessoa antes.",
  inputSchema: {
    type: "object",
    properties: {
      negocio: DEAL_ARG,
      cliente: { type: "string", description: "Cliente existente (nome ou id). Sem isso, cria (ou acha) pelo nome_cliente_novo ou pelo nome da empresa." },
      nome_cliente_novo: { type: "string", maxLength: 120 },
      contrato_dia: { type: "integer", minimum: 1, maximum: 31, description: "Dia do vencimento da mensalidade. Sem isso, não cria contrato." },
      contrato_inicio: { type: "string", description: "Mês de início do contrato (aaaa-mm). Padrão: o próximo mês." },
      contrato_meses: { type: ["integer", "null"], minimum: 1, maximum: 120, description: "Duração; null = sem prazo. Padrão: a do negócio." },
      entrada_vencimento: { type: "string", description: "Vencimento da entrada pontual (aaaa-mm-dd). Sem isso, não lança." },
      projeto: { type: "string", maxLength: 200, description: "Nome do projeto a criar. Sem isso, não cria." },
    },
    required: ["negocio"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, today } = context
    const query = readRequiredText(args, "negocio", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDeal(context, query.value)
    if (!found.ok) return toolError(found.error)
    const deal = found.value

    let clientId: string | null = deal.client_id
    if ("cliente" in args && !isClear(args.cliente)) {
      const client = findClient(await loadDirectory(supabase), String(args.cliente))
      if (!client.ok) return toolError(client.error)
      clientId = client.value.id
    }
    const startRaw = readText(args, "contrato_inicio", 10)
    if (!startRaw.ok) return toolError(startRaw.error)
    const starts = startRaw.value ? (/^\d{4}-\d{2}$/.test(startRaw.value) ? `${startRaw.value}-01` : startRaw.value) : defaultContractStart(today)
    const due = readOptionalDate(args, "entrada_vencimento", today)
    if (!due.ok) return toolError(due.error)
    const hasContract = typeof args.contrato_dia === "number"

    const won = await markDealWon(supabase, deal.id, {
      client_id: clientId,
      client_name: clientId ? null : (args.nome_cliente_novo ?? deal.company ?? deal.title),
      contract_day: hasContract ? args.contrato_dia : null,
      contract_starts_on: hasContract ? starts : null,
      contract_months: hasContract ? ("contrato_meses" in args ? args.contrato_meses : deal.term_months) : null,
      one_time_due_on: due.value ?? null,
      project_name: args.projeto ?? null,
    })
    if (!won.ok) return toolError(won.error)
    const result = won.data
    return textResult(
      [
        `Negócio "${deal.title}" ganho.`,
        `- Cliente: ${result.client_created ? "criado" : "ligado"} (id ${result.client_id})`,
        result.recurrence_id ? `- Contrato criado no financeiro (recorrência ${result.recurrence_id})` : "- Sem contrato",
        result.entry_id ? `- Entrada pontual lançada (${result.entry_id})` : null,
        result.project_id ? `- Projeto criado (id ${result.project_id})` : null,
        `${context.origin}/clientes/${result.client_id}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
  },
}

const deleteDeal: Tool<McpContext> = {
  name: "excluir_negocio",
  title: "Excluir negócio",
  description: "Exclui um negócio (para registrar que não fechou, prefira editar_negocio com etapa perdido). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { negocio: DEAL_ARG, confirmar: CONFIRM }, required: ["negocio"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const query = readRequiredText(args, "negocio", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDeal(context, query.value)
    if (!found.ok) return toolError(found.error)
    const deal = found.value
    const pending = confirmFirst(args, `o negócio "${deal.title}" (id ${deal.id})`, [
      `${DEAL_STAGE_LABEL[deal.stage]} · contrato ${formatMoney(contractValue(deal))}.`,
      "Some dos números do comercial (funil, conversão, vendas do mês). Cliente, contrato e projeto criados ao ganhar continuam.",
    ])
    if (pending) return pending
    const removed = await removeDeal(context.supabase, deal.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult(`Negócio "${deal.title}" excluído.`)
  },
}

export const DEAL_TOOLS = [listDeals, viewDeal, createDeal, editDeal, winDeal, deleteDeal]
