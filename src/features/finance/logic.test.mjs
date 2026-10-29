// Teste do financeiro do cliente no portal e dos avisos de atraso (sem dependências):
//   node --test src/features/finance/logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "./test-setup.mjs"

const {
  chargeKey,
  clientOverdue,
  clientStatement,
  occurrenceDue,
  overdueNoticesDue,
  overdueNoticeText,
  noticeKey,
} = await load("@/features/finance/logic")
const { parsePortalFinance } = await load("@/features/portal/finance-logic")

const CLIENT = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

const base = { kind: "income", account: "client_revenue", category: null, project_id: null, notes: null, created_by: "", created_at: "", updated_at: "" }

function recurrence(id, fields) {
  return { ...base, id, description: "Mensalidade", amount_cents: 350000, day_of_month: 25, client_id: CLIENT, starts_on: "2026-01-01", ends_on: null, ...fields }
}

function entry(id, fields) {
  return { ...base, id, description: "Avulso", amount_cents: 100000, fee_cents: 0, due_on: "2026-10-10", paid_on: null, skipped: false, client_id: CLIENT, recurrence_id: null, period: null, ...fields }
}

test("vencimento da ocorrência: dia do mês ajustado ao fim do mês", () => {
  assert.equal(occurrenceDue({ day_of_month: 31 }, "2026-02-01"), "2026-02-28")
  assert.equal(occurrenceDue({ day_of_month: 31 }, "2028-02-01"), "2028-02-29")
  assert.equal(occurrenceDue({ day_of_month: 31 }, "2026-04-01"), "2026-04-30")
  assert.equal(occurrenceDue({ day_of_month: 31 }, "2026-05-01"), "2026-05-31")
  assert.equal(occurrenceDue({ day_of_month: 5 }, "2026-06-01"), "2026-06-05")
})

test("extrato do cliente: atrasados, próximos e pagos, só receitas dele", () => {
  const today = "2026-10-29"
  const recurrences = [
    recurrence("r1", { starts_on: "2026-08-01" }),
    // Terminou em setembro: outubro não cobra.
    recurrence("r2", { description: "Projeto site", amount_cents: 200000, day_of_month: 10, starts_on: "2026-07-01", ends_on: "2026-09-01" }),
    // Outro cliente e custo direto do cliente: nunca entram.
    recurrence("r3", { client_id: OTHER }),
    recurrence("r4", { kind: "expense", account: "direct_cost", description: "Freelancer" }),
  ]
  const entries = [
    // Agosto pago; setembro pulado; julho do r2 pago.
    entry("e1", { recurrence_id: "r1", period: "2026-08-01", due_on: "2026-08-25", paid_on: "2026-08-26", amount_cents: 350000 }),
    entry("e2", { recurrence_id: "r1", period: "2026-09-01", due_on: "2026-09-25", skipped: true, amount_cents: 350000 }),
    entry("e3", { recurrence_id: "r2", period: "2026-07-01", due_on: "2026-07-10", paid_on: "2026-07-10", amount_cents: 200000 }),
    // Avulso vencido e não pago; outro de outra conta.
    entry("e4", { description: "Ensaio", due_on: "2026-10-05" }),
    entry("e5", { description: "Reembolso", account: "other_revenue", due_on: "2026-10-06" }),
  ]
  const statement = clientStatement(CLIENT, entries, recurrences, today)
  // r2: agosto e setembro em aberto; e4; r1 outubro (25/10).
  assert.deepEqual(
    statement.overdue.map((item) => [item.description, item.due_on]),
    [
      ["Projeto site", "2026-08-10"],
      ["Projeto site", "2026-09-10"],
      ["Ensaio", "2026-10-05"],
      ["Mensalidade", "2026-10-25"],
    ]
  )
  assert.equal(statement.overdueTotal, 200000 * 2 + 100000 + 350000)
  assert.deepEqual(
    statement.upcoming.map((item) => item.due_on),
    ["2026-11-25", "2026-12-25"]
  )
  assert.deepEqual(
    statement.paid.map((item) => item.paid_on),
    ["2026-08-26", "2026-07-10"]
  )
  // O atraso do portal é o "Em atraso" da página do cliente (só com receitas de cliente).
  assert.deepEqual(
    statement.overdue.map((item) => item.key),
    clientOverdue(CLIENT, entries, recurrences, today)
      .filter((item) => item.account === "client_revenue")
      .map((item) => item.key)
  )
})

test("mês gravado para outro cliente não volta como pendente", () => {
  const recurrences = [recurrence("r1", { starts_on: "2026-10-01" })]
  const entries = [entry("e1", { recurrence_id: "r1", period: "2026-10-01", due_on: "2026-10-25", client_id: OTHER })]
  assert.deepEqual(clientStatement(CLIENT, entries, recurrences, "2026-10-29").overdue, [])
})

test("o retorno de portal_finance vira os mesmos atrasos", () => {
  const raw = {
    reminders: true,
    entries: [{ id: "e1", description: "Ensaio", amount_cents: 100000, due_on: "2026-10-05", paid_on: null, recurrence_id: null, period: null }],
    recurrences: [{ id: "r1", description: "Mensalidade", amount_cents: 350000, day_of_month: 31, starts_on: "2026-08-01", ends_on: null }],
    taken: [{ recurrence_id: "r1", period: "2026-09-01" }],
  }
  const data = parsePortalFinance(CLIENT, raw)
  assert.equal(data.reminders, true)
  const statement = clientStatement(CLIENT, data.entries, data.recurrences, "2026-10-29")
  assert.deepEqual(
    statement.overdue.map((item) => [item.description, item.due_on, item.amount_cents]),
    [
      ["Mensalidade", "2026-08-31", 350000],
      ["Ensaio", "2026-10-05", 100000],
    ]
  )
  assert.deepEqual(statement.upcoming.map((item) => item.due_on), ["2026-10-31", "2026-11-30"])
  assert.deepEqual(parsePortalFinance(CLIENT, null), { reminders: false, entries: [], recurrences: [] })
})

test("chave da cobrança: a mesma para a ocorrência virtual e o lançamento que nasce dela", () => {
  const recurrences = [recurrence("r1", { starts_on: "2026-10-01" })]
  const [virtual] = clientOverdue(CLIENT, [], recurrences, "2026-10-29")
  const [saved] = clientOverdue(
    CLIENT,
    [entry("e9", { recurrence_id: "r1", period: "2026-10-01", due_on: "2026-10-25", amount_cents: 300000 })],
    recurrences,
    "2026-10-29"
  )
  assert.equal(chargeKey(virtual), "r:r1:2026-10-01")
  assert.equal(chargeKey(saved), "r:r1:2026-10-01")
  const [single] = clientOverdue(CLIENT, [entry("e4", { due_on: "2026-10-05" })], [], "2026-10-29")
  assert.equal(chargeKey(single), "e4")
})

test("quando avisar: equipe no dia 1 e no 7, cliente no 3, uma vez só", () => {
  const recurrences = [recurrence("r1", { starts_on: "2026-10-01" })]
  const sent = new Set()
  const log = []
  for (let day = 25; day <= 31 + 7; day += 1) {
    const today = day <= 31 ? `2026-10-${String(day).padStart(2, "0")}` : `2026-11-${String(day - 31).padStart(2, "0")}`
    for (const item of clientOverdue(CLIENT, [], recurrences, today)) {
      for (const stage of overdueNoticesDue(item, today, sent, true)) {
        sent.add(noticeKey(chargeKey(item), stage, item.due_on))
        log.push([today, stage])
      }
    }
  }
  assert.deepEqual(log, [
    ["2026-10-26", "team_due"],
    ["2026-10-28", "client_due"],
    ["2026-11-01", "team_week"],
  ])
})

test("quando avisar: folga de 2 dias, interruptor desligado, pago e pulado", () => {
  const item = clientOverdue(CLIENT, [], [recurrence("r1", { starts_on: "2026-10-01" })], "2026-10-29")[0]
  const none = new Set()
  // Job parado nos dias 26 e 27: no 28 ainda saem a equipe (dia 3 de folga) e o cliente.
  assert.deepEqual(overdueNoticesDue(item, "2026-10-28", none, true), ["team_due", "client_due"])
  assert.deepEqual(overdueNoticesDue(item, "2026-10-29", none, true), ["client_due"])
  // Atraso antigo (ex.: já existia quando o job entrou): nada.
  assert.deepEqual(overdueNoticesDue(item, "2026-11-20", none, true), [])
  // Cliente com o aviso desligado: só a equipe.
  assert.deepEqual(overdueNoticesDue(item, "2026-10-28", none, false), ["team_due"])
  // Já avisado neste vencimento.
  const sent = new Set([noticeKey("r:r1:2026-10-01", "client_due", "2026-10-25")])
  assert.deepEqual(overdueNoticesDue(item, "2026-10-28", sent, true), ["team_due"])
  assert.deepEqual(overdueNoticesDue({ ...item, paid_on: "2026-10-27" }, "2026-10-28", none, true), [])
  assert.deepEqual(overdueNoticesDue({ ...item, skipped: true }, "2026-10-28", none, true), [])
})

test("texto do aviso no portal", () => {
  const items = clientOverdue(CLIENT, [entry("e4", { due_on: "2026-10-05" })], [recurrence("r1", { starts_on: "2026-10-01" })], "2026-10-29")
  assert.equal(overdueNoticeText(items.slice(1)), "Consta um pagamento em aberto de R$ 3.500,00, vencido em 25/10.")
  assert.equal(overdueNoticeText(items), "Constam 2 pagamentos em aberto, somando R$ 4.500,00. O mais antigo venceu em 05/10.")
  assert.equal(overdueNoticeText([]), null)
})
