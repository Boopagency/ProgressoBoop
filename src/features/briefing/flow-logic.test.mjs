// Regras do fluxo do briefing no portal (flow-logic.ts). Roda com:
//   node --test src/features/briefing/flow-logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "../finance/test-setup.mjs"

const logic = await load("@/features/briefing/flow-logic")
const { EMPTY_ANSWER } = logic

const q = (id, kind, options = {}, required = true, key = id) => ({
  id, key, text: id, hint: null, kind, options: logic.parseOptions(options), required,
})
const answer = (patch) => ({ ...EMPTY_ANSWER, ...patch })

test("parseOptions lê o formato da migration e ignora o que não serve", () => {
  const options = logic.parseOptions({
    max: 2, other: true, voice: "essential", unit: "BRL",
    choices: [{ value: "a", label: "A" }, { value: "sem rótulo" }],
    extras: [{ key: "meta", kind: "short_text", label: "Meta", required: true }, { key: "x", kind: "video", label: "X" }],
  })
  assert.equal(options.max, 2)
  assert.equal(options.other, true)
  assert.equal(options.voice, "essential")
  assert.equal(options.unit, "BRL")
  assert.deepEqual(options.choices, [{ value: "a", label: "A" }])
  assert.deepEqual(options.extras.map((extra) => extra.key), ["meta"])
  assert.deepEqual(logic.parseOptions(null).choices, [])
})

test("normalizeValue tira o vazio e devolve null quando não sobra nada", () => {
  assert.equal(logic.normalizeValue({}), null)
  assert.equal(logic.normalizeValue({ choices: [], links: ["  "], fields: { a: " " }, extras: { meta: "" } }), null)
  assert.deepEqual(logic.normalizeValue({ choice: "a", other: "não vale sem Outro" }), { choice: "a" })
  assert.deepEqual(logic.normalizeValue({ choice: "other", other: "  feira  " }), { choice: "other", other: "feira" })
  assert.deepEqual(logic.normalizeValue({ palette: { use: ["#FF0000", "vermelho"], avoid: ["#ff0000"] } }), {
    palette: { use: ["#ff0000"], avoid: ["#ff0000"] },
  })
  assert.deepEqual(logic.normalizeValue({ cards: { yes: ["calm"], no: ["calm", "formal"], primary: "formal" } }), {
    cards: { yes: ["calm"], no: ["formal"] },
  })
  assert.deepEqual(logic.normalizeValue({ dates: [{ date: "", label: "x" }, { date: "2026-12-01", label: " Natal " }] }), {
    dates: [{ date: "2026-12-01", label: "Natal" }],
  })
})

test("isAnswerComplete por tipo, com obrigatório extra e pulada", () => {
  const audio = q("a", "audio")
  assert.equal(logic.isAnswerComplete(audio, undefined), false)
  assert.equal(logic.isAnswerComplete(audio, answer({ text: "  " })), false)
  assert.equal(logic.isAnswerComplete(audio, answer({ text: "Bolos" })), true)
  assert.equal(logic.isAnswerComplete(audio, answer({ audios: [{ id: "1", duration_ms: 1000, created_at: "" }] })), true)
  assert.equal(logic.isAnswerComplete(audio, answer({ text: "Bolos", skipped: true })), false)

  const choice = q("c", "choice", { other: true, choices: [{ value: "a", label: "A" }] })
  assert.equal(logic.isAnswerComplete(choice, answer({ value: { choice: "other" } })), false)
  assert.equal(logic.isAnswerComplete(choice, answer({ value: { choice: "other", other: "Feira" } })), true)

  const multiple = q("m", "multiple", { max: 2, choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }] })
  assert.equal(logic.isAnswerComplete(multiple, answer({ value: { choices: ["a", "b", "c"] } })), false)
  assert.equal(logic.isAnswerComplete(multiple, answer({ value: { choices: ["a", "b"] } })), true)

  const cards = q("t", "cards", { max: 2, primary: true, cards: [{ value: "x", label: "X", example: "x" }] })
  assert.equal(logic.isAnswerComplete(cards, answer({ value: { cards: { yes: ["x", "y"], no: [] } } })), false)
  assert.equal(logic.isAnswerComplete(cards, answer({ value: { cards: { yes: ["x", "y"], no: [], primary: "y" } } })), true)

  const approver = q("ap", "choice", { choices: [{ value: "1d", label: "1 dia" }], extras: [{ key: "name", kind: "short_text", label: "Nome", required: true }] })
  assert.equal(logic.isAnswerComplete(approver, answer({ value: { choice: "1d" } })), false)
  assert.equal(logic.isAnswerComplete(approver, answer({ value: { choice: "1d", extras: { name: "Ana" } } })), true)

  assert.equal(logic.isAnswerComplete(q("n", "number"), answer({ value: { number: 0 } })), true)
  assert.equal(logic.isAnswerComplete(q("id", "identification"), answer({ value: { fields: { brand_name: "Doceria" } } })), true)
  const upload = q("u", "upload", { extras: [{ key: "folder", kind: "links", label: "Pasta" }] })
  assert.equal(logic.isAnswerComplete(upload, answer({ value: { extras: { folder: ["https://drive"] } } })), true)
})

test("telas, retomada e o que falta", () => {
  const blocks = [
    { id: "b0", title: "Pra começar", description: null, estimated_minutes: 1, questions: [q("id", "identification")] },
    { id: "b1", title: "Negócio", description: null, estimated_minutes: 6, questions: [q("x", "audio"), q("y", "short_text", {}, false)] },
    { id: "vazio", title: "Sem perguntas", description: null, estimated_minutes: 2, questions: [] },
  ]
  const steps = logic.buildSteps(blocks)
  assert.deepEqual(
    steps.map((step) => step.type + (step.question ? `:${step.question.id}` : step.blockIndex !== undefined ? `:${step.blockIndex}` : "")),
    ["intro", "question:id", "block_done:0", "question:x", "question:y", "block_done:1", "review"]
  )
  assert.equal(logic.resumeIndex(steps, "y"), 4)
  assert.equal(logic.resumeIndex(steps, null), 0)
  assert.equal(logic.resumeIndex(steps, "sumiu"), 0)

  const answers = { id: answer({ value: { fields: { brand_name: "Doceria" } } }), y: answer({ skipped: true }) }
  assert.deepEqual(logic.missingRequired(blocks, answers).map((item) => item.id), ["x"])
  assert.deepEqual(logic.missingRequired(blocks, answers, "b0"), [])
  assert.deepEqual(logic.skippedQuestions(blocks, answers).map((item) => item.id), ["y"])
  assert.equal(logic.remainingMinutes(blocks, ["b0"]), 8)
  assert.equal(logic.progressFraction(blocks, answers), 1 / 3)
})

test("card Sua marca: só o que o cliente escolheu e enviou", () => {
  const blocks = [
    {
      id: "b", title: "B", description: null, estimated_minutes: 1,
      questions: [
        q("i", "identification", {}, true, "identification"),
        q("s", "choice", { choices: [{ value: "whatsapp", label: "WhatsApp" }] }, true, "sales_channel"),
        q("t", "cards", { cards: [{ value: "calm", label: "Calma", example: "x" }, { value: "close", label: "Próxima", example: "y" }] }, true, "brand_tone"),
        q("l", "links", {}, false, "competitors"),
        q("u", "upload", { extras: [{ key: "palette", kind: "palette", label: "Cores" }] }, false, "identity"),
      ],
    },
  ]
  const card = logic.buildBrandCard({
    blocks,
    identification: { brand_name: "Da equipe", region: "Curitiba" },
    answers: {
      i: answer({ value: { fields: { brand_name: "Doceria da Ana" } } }),
      s: answer({ value: { choice: "whatsapp" } }),
      t: answer({ value: { cards: { yes: ["calm", "close"], no: [], primary: "close" } } }),
      l: answer({ value: { links: ["@a", "@b"] } }),
      u: answer({ files: [{ path: "p", name: "logo.png", mime_type: "image/png", size_bytes: 10 }], value: { extras: { palette: { use: ["#ff0000"], avoid: [] } } } }),
    },
  })
  assert.equal(card.name, "Doceria da Ana")
  assert.equal(card.region, "Curitiba")
  assert.equal(card.channel, "WhatsApp")
  assert.deepEqual(card.tones, ["Próxima", "Calma"])
  assert.deepEqual(card.colors, ["#ff0000"])
  assert.equal(card.references, 2)
  assert.equal(card.materials, 1)
  assert.equal(card.since, null)
})

test("parseBrl entende o jeito brasileiro de escrever dinheiro", () => {
  assert.equal(logic.parseBrl("180"), 180)
  assert.equal(logic.parseBrl("1.234,56"), 1234.56)
  assert.equal(logic.parseBrl("R$ 99,9"), 99.9)
  assert.equal(logic.parseBrl("1.500"), 1500)
  assert.equal(logic.parseBrl(""), null)
})
