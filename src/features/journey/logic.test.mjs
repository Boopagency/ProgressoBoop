// Regras da jornada (logic.ts e catalog.ts). Roda com:
//   node --test src/features/journey/logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "../finance/test-setup.mjs"

const catalog = await load("@/features/journey/catalog")
const logic = await load("@/features/journey/logic")

const journey = (patch = {}) => ({
  id: "j1",
  client_id: "c1",
  client_name: "Alfa",
  client_active: true,
  owner_id: null,
  line: "social",
  phase: "entry",
  mode: "full",
  phase_started_on: "2026-11-02",
  started_on: "2026-11-02",
  contract_ends_on: null,
  ended_on: null,
  marks: [],
  facts: logic.parseFacts({}),
  ...patch,
})

const mark = (step_key, round, state = "done", marked_at = "2026-11-03T12:00:00Z") => ({
  step_key,
  round,
  state,
  note: null,
  marked_by: "p1",
  marked_at,
})

test("as chaves das etapas são únicas em cada linha e os portões não aceitam 'não se aplica'", () => {
  for (const def of Object.values(catalog.JOURNEY_CATALOG)) {
    const keys = def.phases.flatMap((phase) => phase.steps.map((step) => step.key))
    assert.equal(new Set(keys).size, keys.length, def.line)
    for (const phase of def.phases) for (const step of phase.steps) assert.equal(logic.canSkip(step), !step.gate)
  }
  assert.equal(catalog.findStep("traffic", "instagram_connected"), null)
  assert.equal(catalog.findStep("social", "first_post").phase, "onboarding")
})

test("o serviço vendido escolhe a linha da jornada", () => {
  assert.equal(catalog.lineForService("Tráfego pago"), "traffic")
  assert.equal(catalog.lineForService("Social media"), "social")
  assert.equal(catalog.lineForService(null), "social")
  assert.equal(catalog.lineForService("Site"), null)
})

test("parseFacts lê só o que está no formato", () => {
  const facts = logic.parseFacts({ deal_won: "2026-11-02", owner_defined: true, monthly_reviews: ["2026-10", "x"], first_post: 3 })
  assert.equal(facts.deal_won, "2026-11-02")
  assert.equal(facts.owner_defined, true)
  assert.deepEqual(facts.monthly_reviews, ["2026-10"])
  assert.equal(facts.first_post, null)
})

test("prazos: dias úteis desde a fase, dia do mês e enésimo dia útil", () => {
  const step = (key, line = "social") => catalog.findStep(line, key).step
  assert.equal(logic.stepDueOn(step("contract_signed"), "full", "2026-11-06", "2026-11-09"), "2026-11-10")
  assert.equal(logic.stepDueOn(step("first_post"), "full", "2026-11-02", "2026-11-09"), "2026-12-07")
  assert.equal(logic.stepDueOn(step("first_post"), "compact", "2026-11-02", "2026-11-09"), "2026-11-16")
  assert.equal(logic.stepDueOn(step("all_scheduled"), "full", "2026-01-01", "2026-02-10"), "2026-02-18")
  assert.equal(logic.stepDueOn(step("weekly_optimization", "traffic"), "full", "2026-01-01", "2026-02-10"), "2026-02-28")
  // 10º dia útil de novembro de 2026.
  assert.equal(logic.stepDueOn(step("monthly_report"), "full", "2026-01-01", "2026-11-09"), "2026-11-13")
})

test("o automático marca, a marcação à mão vale mais e 'reabrir' desliga o automático", () => {
  const facts = logic.parseFacts({ deal_won: "2026-11-02", owner_defined: true })
  let status = logic.evaluateJourney(journey({ facts }), "2026-11-03")
  assert.equal(status.steps[0].source, "auto")
  assert.equal(status.current.step.key, "contract_signed")
  assert.equal(status.attention, "client")

  status = logic.evaluateJourney(journey({ facts, marks: [mark("deal_won", "2026-11-02", "open")] }), "2026-11-03")
  assert.equal(status.current.step.key, "deal_won")
  assert.equal(status.current.reopened, true)
  // Marcação de outra rodada não vale.
  status = logic.evaluateJourney(journey({ facts, marks: [mark("contract_signed", "2026-10-01")] }), "2026-11-03")
  assert.equal(status.current.step.key, "contract_signed")
})

test("parada, atraso e o que pede ação primeiro", () => {
  const facts = logic.parseFacts({ deal_won: "2026-11-02" })
  const late = logic.evaluateJourney(journey({ facts, marks: [mark("contract_signed", "2026-11-02", "done", "2026-11-03T12:00:00Z")] }), "2026-11-10")
  assert.equal(late.current.step.key, "first_payment")
  assert.equal(late.late, true)
  assert.equal(late.late_days, 5)
  assert.equal(late.since, "2026-11-03")
  assert.equal(late.days_in_step, 7)

  const done = journey({
    id: "j2",
    client_name: "Beta",
    marks: catalog.phaseDef("social", "entry").steps.map((step) => mark(step.key, "2026-11-02")),
  })
  const ready = logic.evaluateJourney(done, "2026-11-04")
  assert.equal(ready.complete, true)
  assert.equal(ready.attention, "ready")
  assert.equal(ready.next, "onboarding")

  const ongoing = logic.evaluateJourney(
    journey({ id: "j3", client_name: "Gama", phase: "ongoing", phase_started_on: "2026-09-01", contract_ends_on: "2026-11-30" }),
    "2026-11-02"
  )
  assert.equal(ongoing.attention, "renewal")
  assert.equal(ongoing.contract_days, 28)

  const order = logic.sortByAttention([ongoing, ready, logic.evaluateJourney(journey({ id: "j4", client_name: "Delta" }), "2026-11-02"), late])
  assert.deepEqual(order.map((status) => status.record.id), ["j1", "j2", "j3", "j4"])
})

test("ongoing: rodada do mês, trimestral só no fim do trimestre e o 1º mês sem o que já tinha vencido", () => {
  const record = journey({ phase: "ongoing", phase_started_on: "2026-11-05" })
  const nov = logic.evaluateJourney(record, "2026-11-09")
  assert.equal(nov.round, "2026-11")
  assert.ok(!nov.steps.some((step) => step.step.key === "month_numbers" || step.step.key === "quarterly_meeting"))
  const dec = logic.evaluateJourney(record, "2026-12-02")
  assert.ok(dec.steps.some((step) => step.step.key === "quarterly_meeting"))
  assert.equal(dec.steps[0].step.key, "month_numbers")
  // A revisão do mês marca o relatório.
  const reviewed = logic.evaluateJourney({ ...record, facts: logic.parseFacts({ monthly_reviews: ["2026-12"] }) }, "2026-12-02")
  assert.equal(reviewed.steps.find((step) => step.step.key === "monthly_report").source, "auto")
})

test("parseJourneyRows ignora o que não é jornada", () => {
  const rows = logic.parseJourneyRows([
    { id: "a", client_id: "c", client_name: "Alfa", line: "social", phase: "ongoing", mode: "compact", phase_started_on: "2026-11-01", started_on: "2026-10-01", marks: [{ step_key: "x", round: "2026-11", state: "done", marked_at: "2026-11-02T10:00:00Z" }, { step_key: "y", round: "2026-11", state: "talvez" }], facts: {} },
    { id: "b", client_id: "c", line: "site", phase: "entry", phase_started_on: "2026-11-01", started_on: "2026-11-01" },
    null,
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].mode, "compact")
  assert.equal(rows[0].marks.length, 1)
})
