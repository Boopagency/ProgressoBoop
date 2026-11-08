// Regras da central de briefings (central-logic.ts). Roda com:
//   node --test src/features/briefing/central-logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "../finance/test-setup.mjs"

const logic = await load("@/features/briefing/central-logic")

const TODAY = "2026-11-08"
const form = {
  blocks: [
    { id: "b1", template_id: "t1", position: 1, title: "B1", description: null, estimated_minutes: 1, active: true },
    { id: "bx", template_id: "t1", position: 2, title: "Off", description: null, estimated_minutes: 1, active: false },
  ],
  questions: ["q1", "q2", "q3", "q4"].map((id, index) => ({
    id, block_id: index === 3 ? "bx" : "b1", position: index, key: null, text: id, hint: null, kind: "short_text",
    options: {}, required: index < 2, active: true, created_at: "2026-10-01T00:00:00Z",
  })),
}
const answer = (question_id, patch = {}) => ({ question_id, skipped: false, text: null, value: null, files: [], audios: 0, ai: [], ...patch })
const client = (id, name, briefing, active = true) => ({
  id, name, active, avatar_path: null, contact_name: null, instagram_handle: null,
  briefing: briefing && {
    id: `bf-${id}`, template_id: "t1", released_at: "2026-11-01T12:00:00Z", submitted_at: null, last_seen_at: null, answers: [], ...briefing,
  },
})

test("o andamento usa a regra da aba: pulada e vazia não contam, bloco inativo fica de fora", () => {
  const row = logic.buildBriefingRow(
    client("c1", "A", {
      status: "in_progress", due_on: "2026-11-10",
      answers: [answer("q1", { audios: 1 }), answer("q2", { skipped: true, text: "x" }), answer("q3", { text: "  " }), answer("q4", { text: "fora" })],
    }),
    form, TODAY
  )
  assert.equal(row.total, 3)
  assert.equal(row.answered, 1)
  assert.equal(row.percent, 33)
  assert.equal(row.missingRequired, 1)
  assert.equal(row.due, "ok")
})

test("IA: falha pesa mais que pendente; pronta não sinaliza", () => {
  assert.equal(logic.aggregateAi(["ready", "pending", "failed"]), "failed")
  assert.equal(logic.aggregateAi(["ready", "processing"]), "pending")
  assert.equal(logic.aggregateAi(["ready"]), null)
  assert.equal(logic.aggregateAi([]), null)
})

test("ordem: enviado, atrasado, em preenchimento; sem briefing só os ativos", () => {
  const central = logic.buildBriefingCentral(
    [
      client("c1", "Validado", { status: "validated", due_on: "2026-10-01", submitted_at: "2026-10-01T12:00:00Z" }),
      client("c2", "Preenchendo", { status: "in_progress", due_on: "2026-11-12" }),
      client("c3", "Atrasado", { status: "not_started", due_on: "2026-11-05" }),
      client("c4", "Enviado", { status: "submitted", due_on: "2026-11-05", submitted_at: "2026-11-07T12:00:00Z" }),
      client("c5", "Sem", null),
      client("c6", "Inativo sem", null, false),
    ],
    form, TODAY
  )
  assert.deepEqual(central.rows.map((row) => row.name), ["Enviado", "Atrasado", "Preenchendo", "Validado"])
  assert.equal(central.rows[1].lateDays, 3)
  assert.deepEqual(central.withoutBriefing.map((item) => item.name), ["Sem"])
  assert.equal(central.rows.filter(logic.needsAction).length, 2)
})

test("filtro por status, por 'pedem ação' e busca sem acento", () => {
  const central = logic.buildBriefingCentral(
    [client("c1", "Clínica Lume", { status: "submitted", due_on: "2026-11-05" }), client("c2", "Café", { status: "in_progress", due_on: "2026-11-20" })],
    form, TODAY
  )
  assert.deepEqual(logic.filterBriefingRows(central.rows, "action", "").map((row) => row.name), ["Clínica Lume"])
  assert.deepEqual(logic.filterBriefingRows(central.rows, "in_progress", "").map((row) => row.name), ["Café"])
  assert.deepEqual(logic.filterBriefingRows(central.rows, "all", "clinica").map((row) => row.name), ["Clínica Lume"])
})

test("defaults da identificação a partir da ficha", () => {
  assert.deepEqual(logic.briefingDefaults({ name: "X", contact_name: null, instagram_handle: "@x" }), {
    brand_name: "X", contact_name: "", region: "", instagram: "@x", site: "",
  })
})
