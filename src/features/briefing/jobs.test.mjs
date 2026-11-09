// Testa a rodada do processamento do briefing (jobs.ts) e as regras puras
// (ai-logic.ts) com o banco e as APIs simulados: nenhuma chamada de rede.
//   node --test src/features/briefing/jobs.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "../finance/test-setup.mjs"

const { processBriefingJobs } = await load("@/features/briefing/jobs")
const logic = await load("@/features/briefing/ai-logic")

const SECRET = "segredo-de-teste"
const AUDIO = "11111111-1111-4111-8111-111111111111"
const ANSWER = "22222222-2222-4222-8222-222222222222"
const SUPABASE = "https://proj.supabase.test"
const PATH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/11111111-1111-4111-8111-111111111111"
const OTHER_PATH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/99999999-9999-4999-8999-999999999999"
const signed = (path = PATH, base = SUPABASE) => `${base}/storage/v1/object/sign/briefing/${path}?token=x`
const QUESTION = { text: "Como você descreve o seu cliente ideal?", hint: null, block_title: "Público", kind: "audio" }

/** Banco simulado: devolve as filas na primeira chamada e guarda os resultados. */
function fakeDb({ transcriptions = [], summaries = [] } = {}) {
  const calls = []
  const queues = { briefing_transcriptions_due: [transcriptions], briefing_summaries_due: [summaries] }
  return {
    calls,
    named: (name) => calls.filter((call) => call.name === name).map((call) => call.args),
    supabase: {
      async rpc(name, args) {
        calls.push({ name, args })
        assert.equal(args.p_secret, SECRET)
        if (name in queues) return { data: queues[name].shift() ?? [], error: null }
        return { data: true, error: null }
      },
    },
  }
}

/** Rede simulada: responde por endereço e guarda os pedidos. */
function fakeFetch(routes) {
  const requests = []
  const fetch = async (url, init = {}) => {
    requests.push({ url, init })
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!route) throw new Error(`sem rota para ${url}`)
    const answer = typeof route[1] === "function" ? await route[1](url, init) : route[1]
    return answer instanceof Response ? answer : Response.json(answer.body ?? {}, { status: answer.status ?? 200 })
  }
  return { fetch, requests }
}

const audioRow = { audio_id: AUDIO, storage_path: PATH, signed_url: signed(), mime_type: "audio/mp4", question: QUESTION.text }
const summaryRow = (extra = {}) => ({
  answer_id: ANSWER,
  question: QUESTION,
  answer_text: null,
  transcripts: ["Olha, meu cliente é a mãe que trabalha fora e quer praticidade, sabe? Tipo \"comida de verdade sem drama\"."],
  missing_audios: 0,
  attempts: 1,
  source_hash: null,
  previous_summary: null,
  ...extra,
})
const deadline = () => Date.now() + 55_000

test("transcreve o áudio em português e grava pela função do banco", async () => {
  const db = fakeDb({ transcriptions: [audioRow] })
  const net = fakeFetch({
    "https://proj.supabase.test/storage/": () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    "https://api.openai.com/v1/audio/transcriptions": { body: { text: "  Meu cliente é a mãe que trabalha fora.  " } },
  })
  const result = await processBriefingJobs({
    supabase: db.supabase,
    secret: SECRET,
    keys: { openai: "chave-openai", anthropic: null },
    supabaseUrl: SUPABASE, deadline: deadline(),
    fetch: net.fetch,
  })
  assert.deepEqual(result, { transcribed: 1, summarized: 0, analyzed: 0, failed: 0 })

  const openai = net.requests.find((r) => r.url.includes("openai"))
  assert.equal(openai.init.headers.Authorization, "Bearer chave-openai")
  const form = openai.init.body
  assert.equal(form.get("model"), "gpt-4o-mini-transcribe")
  assert.equal(form.get("language"), "pt")
  assert.equal(form.get("file").name, "audio.m4a")
  assert.match(form.get("prompt"), /cliente ideal/)

  assert.deepEqual(db.named("briefing_transcription_done"), [
    { p_secret: SECRET, p_audio_id: AUDIO, p_transcript: "Meu cliente é a mãe que trabalha fora.", p_model: "gpt-4o-mini-transcribe" },
  ])
  // Sem a chave da Anthropic, nem pede os resumos.
  assert.equal(db.named("briefing_summaries_due").length, 0)
})

test("sem as chaves da IA, não pede nada ao banco (nada pendente gasta tentativa)", async () => {
  const db = fakeDb({ transcriptions: [audioRow], summaries: [summaryRow()] })
  const result = await processBriefingJobs({
    supabase: db.supabase,
    secret: SECRET,
    keys: { openai: null, anthropic: null },
    supabaseUrl: SUPABASE, deadline: deadline(),
    fetch: async () => assert.fail("não deveria chamar a rede"),
  })
  assert.deepEqual(result, { transcribed: 0, summarized: 0, analyzed: 0, failed: 0 })
  assert.equal(db.calls.length, 0)
})

test("erros da OpenAI viram tentar de novo, desistir ou adiar", async () => {
  const cases = [
    { status: 429, outcome: "retry" },
    { status: 500, outcome: "retry" },
    { status: 400, outcome: "final" },
    { status: 401, outcome: "defer" },
  ]
  for (const { status, outcome } of cases) {
    const db = fakeDb({ transcriptions: [audioRow] })
    const net = fakeFetch({
      "https://proj.supabase.test/storage/": () => new Response(new Uint8Array([1]), { status: 200 }),
      "https://api.openai.com/": { status, body: { error: { message: "sk-proj-ABCDEFGHIJKLMNOP falhou" } } },
    })
    const errors = []
    const original = console.error
    console.error = (line) => errors.push(line)
    try {
      await processBriefingJobs({ supabase: db.supabase, secret: SECRET, keys: { openai: "k", anthropic: null }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
    } finally {
      console.error = original
    }
    const [failed] = db.named("briefing_transcription_failed")
    assert.equal(failed.p_outcome, outcome, `status ${status}`)
    assert.match(failed.p_error, new RegExp(`OpenAI respondeu ${status}`))
    assert.doesNotMatch(failed.p_error, /sk-proj-ABCDEFGH/, "a mensagem não leva nada que pareça chave")
    assert.equal(db.named("briefing_transcription_done").length, 0)
  }
})

test("link vencido ou arquivo sumido: desiste sem chamar a OpenAI", async () => {
  const db = fakeDb({ transcriptions: [audioRow] })
  const net = fakeFetch({ "https://proj.supabase.test/storage/": { status: 400, body: { error: "InvalidJWT" } } })
  const original = console.error
  console.error = () => {}
  try {
    await processBriefingJobs({ supabase: db.supabase, secret: SECRET, keys: { openai: "k", anthropic: null }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
  } finally {
    console.error = original
  }
  assert.equal(db.named("briefing_transcription_failed")[0].p_outcome, "final")
  assert.ok(!net.requests.some((r) => r.url.includes("openai")))
})

test("resume com o Claude Haiku juntando a pergunta, o texto e os áudios", async () => {
  const db = fakeDb({
    summaries: [summaryRow({ answer_text: "Complemento: atendo Curitiba.", transcripts: ["Primeiro áudio.", "Segundo áudio."] })],
  })
  const net = fakeFetch({
    "https://api.anthropic.com/v1/messages": {
      body: {
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "Mães que trabalham fora e querem \"comida de verdade sem drama\"." },
        ],
      },
    },
  })
  const result = await processBriefingJobs({
    supabase: db.supabase,
    secret: SECRET,
    keys: { openai: null, anthropic: "chave-anthropic" },
    supabaseUrl: SUPABASE, deadline: deadline(),
    fetch: net.fetch,
  })
  assert.deepEqual(result, { transcribed: 0, summarized: 1, analyzed: 0, failed: 0 })

  const [request] = net.requests
  assert.equal(request.init.headers["x-api-key"], "chave-anthropic")
  assert.equal(request.init.headers["anthropic-version"], "2026-10-21")
  const body = JSON.parse(request.init.body)
  assert.equal(body.model, "claude-haiku-5-5")
  assert.equal(body.temperature, undefined, "a versão nova da API recusa temperature")
  assert.match(body.system, /entre aspas/)
  assert.match(body.system, /Não invente/)
  const content = body.messages[0].content
  assert.match(content, /<pergunta bloco="Público">\nComo você descreve o seu cliente ideal\?/)
  assert.match(content, /<resposta_escrita>\nComplemento: atendo Curitiba\.\n<\/resposta_escrita>/)
  assert.match(content, /<audio n="1">\nPrimeiro áudio\.\n<\/audio>/)
  assert.match(content, /<audio n="2">\nSegundo áudio\.\n<\/audio>/)

  const [done] = db.named("briefing_summary_done")
  assert.equal(done.p_summary, "Mães que trabalham fora e querem \"comida de verdade sem drama\".")
  assert.equal(done.p_model, "claude-haiku-5-5")
  assert.equal(done.p_source_hash, logic.summarySourceHash({ question: QUESTION, text: "Complemento: atendo Curitiba.", transcripts: ["Primeiro áudio.", "Segundo áudio."] }))
})

test("nada mudou no que se resume: mantém o resumo sem chamar a IA", async () => {
  const row = summaryRow()
  const hash = logic.summarySourceHash({ question: row.question, text: row.answer_text, transcripts: row.transcripts })
  const db = fakeDb({ summaries: [{ ...row, source_hash: hash, previous_summary: "Resumo antigo." }] })
  await processBriefingJobs({
    supabase: db.supabase,
    secret: SECRET,
    keys: { openai: null, anthropic: "k" },
    supabaseUrl: SUPABASE, deadline: deadline(),
    fetch: async () => assert.fail("não deveria chamar a IA"),
  })
  assert.equal(db.named("briefing_summary_done")[0].p_summary, "Resumo antigo.")
})

test("resposta sem texto nem fala, ou recusa do modelo: desiste do resumo", async () => {
  const original = console.error
  console.error = () => {}
  try {
    const empty = fakeDb({ summaries: [summaryRow({ transcripts: ["  "], missing_audios: 1 })] })
    await processBriefingJobs({ supabase: empty.supabase, secret: SECRET, keys: { openai: null, anthropic: "k" }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: async () => assert.fail() })
    assert.deepEqual(
      { outcome: empty.named("briefing_summary_failed")[0].p_outcome, error: empty.named("briefing_summary_failed")[0].p_error },
      { outcome: "final", error: "Os áudios não puderam ser transcritos." }
    )

    const refused = fakeDb({ summaries: [summaryRow()] })
    const net = fakeFetch({ "https://api.anthropic.com/": { body: { stop_reason: "refusal", content: [] } } })
    await processBriefingJobs({ supabase: refused.supabase, secret: SECRET, keys: { openai: null, anthropic: "k" }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
    assert.equal(refused.named("briefing_summary_failed")[0].p_outcome, "final")
  } finally {
    console.error = original
  }
})

test("transcreve e resume na mesma rodada (áudio de 3 minutos em bem menos de 2 minutos)", async () => {
  const calls = []
  let summaryReady = false
  const supabase = {
    async rpc(name, args) {
      calls.push(name)
      if (name === "briefing_transcriptions_due") return { data: calls.filter((c) => c === name).length === 1 ? [audioRow] : [], error: null }
      if (name === "briefing_transcription_done") {
        summaryReady = true
        return { data: true, error: null }
      }
      if (name === "briefing_summaries_due") {
        const first = calls.filter((c) => c === name).length === 1
        return { data: first && summaryReady ? [summaryRow({ transcripts: [args && "Fala transcrita."] })] : [], error: null }
      }
      return { data: true, error: null }
    },
  }
  const net = fakeFetch({
    "https://proj.supabase.test/storage/": () => new Response(new Uint8Array(3 * 60 * 16000), { status: 200 }),
    "https://api.openai.com/": { body: { text: "Fala transcrita." } },
    "https://api.anthropic.com/": { body: { stop_reason: "end_turn", content: [{ type: "text", text: "Resumo." }] } },
  })
  const started = Date.now()
  const result = await processBriefingJobs({ supabase, secret: SECRET, keys: { openai: "a", anthropic: "b" }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
  assert.deepEqual(result, { transcribed: 1, summarized: 1, analyzed: 0, failed: 0 })
  assert.ok(Date.now() - started < 5000)
  assert.deepEqual(calls, [
    "briefing_transcriptions_due",
    "briefing_transcription_done",
    "briefing_transcriptions_due",
    "briefing_summaries_due",
    "briefing_summary_done",
    "briefing_summaries_due",
  ])
})

test("sem tempo de sobra, não pega item novo (fica para o cron)", async () => {
  const db = fakeDb({ transcriptions: [audioRow], summaries: [summaryRow()] })
  await processBriefingJobs({ supabase: db.supabase, secret: SECRET, keys: { openai: "a", anthropic: "b" }, supabaseUrl: SUPABASE, deadline: Date.now() + 5000, fetch: async () => assert.fail() })
  assert.equal(db.calls.length, 0)
})

/** Roda uma rodada só de transcrição, sem poluir a saída, e devolve a falha gravada. */
async function transcriptionFailure(row, routes) {
  const db = fakeDb({ transcriptions: [row] })
  const net = fakeFetch(routes)
  const original = console.error
  console.error = () => {}
  try {
    await processBriefingJobs({ supabase: db.supabase, secret: SECRET, keys: { openai: "k", anthropic: null }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
  } finally {
    console.error = original
  }
  assert.equal(db.named("briefing_transcription_done").length, 0)
  return { failed: db.named("briefing_transcription_failed"), requests: net.requests }
}

test("URL de outro host: desiste sem baixar nada", async () => {
  for (const url of [
    signed(PATH, "https://evil.test"),
    `${SUPABASE}.evil.test/storage/v1/object/sign/briefing/${PATH}?token=x`,
    `https://proj.supabase.test@evil.test/storage/v1/object/sign/briefing/${PATH}?token=x`,
    "http://169.254.169.254/latest/meta-data/",
  ]) {
    const { failed, requests } = await transcriptionFailure({ ...audioRow, signed_url: url }, {})
    assert.equal(requests.length, 0, url)
    assert.deepEqual(failed, [
      { p_secret: SECRET, p_audio_id: AUDIO, p_error: "O link do áudio não é do Storage do briefing.", p_outcome: "final" },
    ])
  }
})

test("URL de outro arquivo (de outro áudio ou de outro bucket): desiste sem baixar", async () => {
  for (const url of [
    signed(OTHER_PATH),
    `${SUPABASE}/storage/v1/object/sign/content/${PATH}?token=x`,
    `${SUPABASE}/storage/v1/object/sign/briefing/${PATH}/../outro?token=x`,
    `${SUPABASE}/storage/v1/object/public/briefing/${PATH}?token=x`,
  ]) {
    const { failed, requests } = await transcriptionFailure({ ...audioRow, signed_url: url }, {})
    assert.equal(requests.length, 0, url)
    assert.equal(failed[0].p_outcome, "final")
  }
  // Caminho que não é de áudio do briefing, mesmo batendo com a URL.
  const odd = "../../storage/v1/x"
  const { requests } = await transcriptionFailure({ ...audioRow, storage_path: odd, signed_url: signed(odd) }, {})
  assert.equal(requests.length, 0)
})

test("áudio acima de 10 MB: para de baixar e desiste sem chamar a OpenAI", async () => {
  const big = logic.MAX_AUDIO_BYTES + 1
  // Pelo content-length.
  const declared = await transcriptionFailure(audioRow, {
    "https://proj.supabase.test/storage/": () => new Response("x", { headers: { "content-length": String(big) } }),
  })
  assert.deepEqual(
    { outcome: declared.failed[0].p_outcome, error: declared.failed[0].p_error },
    { outcome: "final", error: "O áudio passa de 10 MB." }
  )
  assert.ok(!declared.requests.some((r) => r.url.includes("openai")))

  // Sem content-length: conta os bytes enquanto baixa.
  let pulled = 0
  const stream = new ReadableStream({
    pull(controller) {
      pulled++
      controller.enqueue(new Uint8Array(1024 * 1024))
      if (pulled > 50) controller.close()
    },
  })
  const streamed = await transcriptionFailure(audioRow, { "https://proj.supabase.test/storage/": () => new Response(stream) })
  assert.equal(streamed.failed[0].p_error, "O áudio passa de 10 MB.")
  assert.ok(pulled <= 12, `parou de baixar (${pulled} MB lidos)`)
  assert.ok(!streamed.requests.some((r) => r.url.includes("openai")))
})

test("o download não segue redirecionamento", async () => {
  const db = fakeDb({ transcriptions: [audioRow] })
  const net = fakeFetch({
    "https://proj.supabase.test/storage/": () => new Response(new Uint8Array([1]), { status: 200 }),
    "https://api.openai.com/": { body: { text: "ok" } },
  })
  await processBriefingJobs({ supabase: db.supabase, secret: SECRET, keys: { openai: "k", anthropic: null }, supabaseUrl: SUPABASE, deadline: deadline(), fetch: net.fetch })
  assert.equal(net.requests[0].init.redirect, "error")
})

test("regras puras", () => {
  assert.equal(logic.isBriefingAudioUrl(signed(), `${SUPABASE}/`, PATH), true, "barra no fim da URL do projeto")
  assert.equal(logic.isBriefingAudioUrl(signed(PATH, "http://proj.supabase.test"), "http://proj.supabase.test", PATH), false)
  assert.equal(logic.outcomeForStatus(401), "defer")
  assert.equal(logic.outcomeForStatus(403), "defer")
  assert.equal(logic.outcomeForStatus(429), "retry")
  assert.equal(logic.outcomeForStatus(503), "retry")
  assert.equal(logic.outcomeForStatus(413), "final")
  assert.equal(logic.audioFileName("audio/webm;codecs=opus"), "audio.webm")
  assert.equal(logic.audioFileName("audio/ogg"), "audio.ogg")
  assert.equal(logic.audioFileName("audio/mpeg"), "audio.mp3")
  assert.equal(logic.audioFileName("audio/aac"), "audio.m4a")
  assert.equal(logic.transcriptionPrompt("  "), undefined)
  const timeout = new Error("x")
  timeout.name = "TimeoutError"
  assert.deepEqual(logic.outcomeForThrown(timeout), { outcome: "retry", message: "Tempo esgotado." })
  const a = logic.summarySourceHash({ question: QUESTION, text: "a", transcripts: ["b"] })
  assert.notEqual(a, logic.summarySourceHash({ question: QUESTION, text: "a", transcripts: ["b", "c"] }))
  assert.equal(a, logic.summarySourceHash({ question: QUESTION, text: " a ", transcripts: ["b "] }))
})
